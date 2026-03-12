#!/usr/bin/env ruby
# frozen_string_literal: true

require "base64"
require "json"
require "net/http"
require "openssl"
require "time"
require "uri"

APP_STORE_CONNECT_BASE_URL = "https://api.appstoreconnect.apple.com".freeze
APP_STORE_CONNECT_USERS_GROUP = "App Store Connect Users".freeze

def fail_with(message)
  warn("❌ #{message}")
  exit(1)
end

def first_present_env(*keys)
  keys.each do |key|
    value = ENV[key]
    next if value.nil?

    stripped = value.strip
    return stripped unless stripped.empty?
  end

  nil
end

def csv_items(value)
  return [] if value.nil? || value.empty?

  value.split(/[\n,;]/).map(&:strip).reject(&:empty?).uniq
end

def strict_csv_env(primary_name, secondary_name)
  primary_values = csv_items(first_present_env(primary_name))
  secondary_values = csv_items(first_present_env(secondary_name))

  if primary_values.any? && secondary_values.any? && primary_values != secondary_values
    fail_with("#{primary_name} and #{secondary_name} must match when both are set")
  end

  primary_values.any? ? primary_values : secondary_values
end

def base64url(value)
  Base64.urlsafe_encode64(value, padding: false)
end

def ecdsa_der_to_jose(signature, size:)
  sequence = OpenSSL::ASN1.decode(signature)
  values = sequence.value
  fail_with("Invalid ECDSA signature format") unless values.is_a?(Array) && values.length == 2

  values.map do |component|
    fail_with("Invalid ECDSA signature component") unless component.is_a?(OpenSSL::ASN1::Integer)

    hex = component.value.to_i.to_s(16)
    hex = "0#{hex}" if hex.length.odd?
    bytes = [hex].pack("H*")
    fail_with("ECDSA signature component exceeds #{size} bytes") if bytes.bytesize > size

    bytes.rjust(size, "\x00")
  end.join
rescue OpenSSL::ASN1::ASN1Error => e
  fail_with("Invalid ECDSA signature format: #{e.message}")
end

def build_jwt
  key_id = first_present_env("APPSTORE_KEY_ID") || fail_with("APPSTORE_KEY_ID is required")
  issuer_id = first_present_env("APPSTORE_ISSUER_ID") || fail_with("APPSTORE_ISSUER_ID is required")
  private_key = first_present_env("APPSTORE_PRIVATE_KEY") || fail_with("APPSTORE_PRIVATE_KEY is required")
  private_key = Base64.decode64(private_key) unless private_key.include?("-----BEGIN PRIVATE KEY-----")

  header = { alg: "ES256", kid: key_id, typ: "JWT" }
  now = Time.now.to_i
  payload = { iss: issuer_id, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }
  signing_input = "#{base64url(header.to_json)}.#{base64url(payload.to_json)}"
  signature = OpenSSL::PKey.read(private_key).sign("sha256", signing_input)
  jose_signature = ecdsa_der_to_jose(signature, size: 32)

  "#{signing_input}.#{base64url(jose_signature)}"
end

def request_json(jwt:, method:, path:, payload: nil)
  uri = URI("#{APP_STORE_CONNECT_BASE_URL}#{path}")
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  request_class =
    case method
    when :get then Net::HTTP::Get
    when :post then Net::HTTP::Post
    else
      fail_with("Unsupported HTTP method: #{method}")
    end
  request = request_class.new(uri)
  request["Authorization"] = "Bearer #{jwt}"
  request["Content-Type"] = "application/json"
  request.body = JSON.generate(payload) if payload

  response = http.request(request)
  body = response.body.to_s
  parsed = body.empty? ? {} : JSON.parse(body)

  unless response.is_a?(Net::HTTPSuccess)
    fail_with("App Store Connect API #{method.upcase} #{path} failed with #{response.code}: #{body}")
  end

  parsed
end

def request_json_collection(jwt:, path:)
  items = []
  next_path = path

  while next_path
    response = request_json(jwt: jwt, method: :get, path: next_path)
    items.concat(response.fetch("data", []))
    next_url = response.dig("links", "next")
    next_path = next_url ? URI(next_url).request_uri : nil
  end

  items
end

def read_metadata(path)
  JSON.parse(File.read(path))
rescue Errno::ENOENT
  fail_with("Missing TestFlight metadata file at #{path}")
rescue JSON::ParserError => e
  fail_with("Invalid JSON in #{path}: #{e.message}")
end

def app_id_for_bundle(jwt:, bundle_id:)
  query = URI.encode_www_form("filter[bundleId]" => bundle_id, limit: 1)
  response = request_json(jwt: jwt, method: :get, path: "/v1/apps?#{query}")
  app = response.fetch("data", []).first
  fail_with("No App Store Connect app found for bundle id #{bundle_id}") unless app

  app.fetch("id")
end

def build_for_metadata(jwt:, app_id:, build_number:, marketing_version:)
  query = URI.encode_www_form(
    "filter[app]" => app_id,
    include: "preReleaseVersion",
    limit: 200,
    sort: "-uploadedDate"
  )
  pre_release_versions = {}
  build = nil
  next_path = "/v1/builds?#{query}"

  while next_path && build.nil?
    response = request_json(jwt: jwt, method: :get, path: next_path)
    response.fetch("included", []).each do |item|
      next unless item.fetch("type") == "preReleaseVersions"

      pre_release_versions[item.fetch("id")] = item.dig("attributes", "version")
    end

    build = response.fetch("data", []).find do |item|
      item_build_number = item.dig("attributes", "version").to_s
      pre_release_id = item.dig("relationships", "preReleaseVersion", "data", "id")
      item_marketing_version = pre_release_versions[pre_release_id].to_s
      item_build_number == build_number.to_s && item_marketing_version == marketing_version.to_s
    end

    next_url = response.dig("links", "next")
    next_path = next_url ? URI(next_url).request_uri : nil
  end

  fail_with("No processed build found for #{marketing_version} (#{build_number}) in App Store Connect") unless build

  processing_state = build.dig("attributes", "processingState").to_s
  unless processing_state == "VALID"
    fail_with("Build #{marketing_version} (#{build_number}) is not ready for testing. processingState=#{processing_state}")
  end

  build
end

def beta_groups_by_name(jwt:, app_id:)
  query = URI.encode_www_form("filter[app]" => app_id, limit: 200)
  request_json_collection(jwt: jwt, path: "/v1/betaGroups?#{query}").each_with_object({}) do |group, memo|
    memo[group.dig("attributes", "name")] = group
  end
end

def app_beta_tester_emails(jwt:, app_id:)
  query = URI.encode_www_form("filter[apps]" => app_id, limit: 200)
  request_json_collection(jwt: jwt, path: "/v1/betaTesters?#{query}").map do |tester|
    tester.dig("attributes", "email")
  end.compact.uniq
end

def tester_beta_groups_by_name(jwt:, app_id:, email:)
  query = URI.encode_www_form(
    "filter[apps]" => app_id,
    "filter[email]" => email,
    include: "betaGroups",
    limit: 200
  )
  response = request_json(jwt: jwt, method: :get, path: "/v1/betaTesters?#{query}")
  tester = response.fetch("data", []).first
  return {} unless tester

  included_groups_by_id = response.fetch("included", []).each_with_object({}) do |item, memo|
    next unless item.fetch("type") == "betaGroups"

    memo[item.fetch("id")] = item
  end
  tester_group_ids = Array(tester.dig("relationships", "betaGroups", "data")).map do |group|
    group.fetch("id")
  end

  tester_group_ids.each_with_object({}) do |group_id, memo|
    group = included_groups_by_id[group_id]
    next unless group

    memo[group.dig("attributes", "name")] = group
  end
end

def verify_group_assignment(jwt:, build_id:, groups:)
  missing_groups = groups.reject do |group|
    build_ids = request_json_collection(jwt: jwt, path: "/v1/betaGroups/#{group.fetch('id')}/builds?limit=200").map do |item|
      item.fetch("id")
    end
    build_ids.include?(build_id)
  end

  return if missing_groups.empty?

  missing_names = missing_groups.map { |group| group.dig("attributes", "name") }
  fail_with("Build #{build_id} is missing beta group assignments: #{missing_names.join(', ')}")
end

def required_tester_email
  strict_csv_env("TESTFLIGHT_REQUIRED_TESTER_EMAIL_SECRET", "TESTFLIGHT_REQUIRED_TESTER_EMAIL").first
end

def verify_required_tester_membership(expected_group_names:, tester_groups_by_name:, email:)
  return if email.nil? || email.empty?

  missing_group_names = expected_group_names.reject { |group_name| tester_groups_by_name.key?(group_name) }
  return if missing_group_names.empty?

  visible_group_names = tester_groups_by_name.keys.sort
  fail_with(
    "Required TestFlight tester #{email} is not a member of beta groups: #{missing_group_names.join(', ')}. " \
    "Visible tester beta groups: #{visible_group_names.join(', ')}"
  )
end

def verify_testflight_build_delivery(metadata:)
  bundle_id = metadata.fetch("bundle_id")
  marketing_version = metadata.fetch("marketing_version")
  build_number = metadata.fetch("build_number").to_s
  group_names = strict_csv_env("TESTFLIGHT_GROUPS_SECRET", "TESTFLIGHT_GROUPS")
  fail_with("No TESTFLIGHT_GROUPS configured. Refusing to claim TestFlight delivery without an explicit beta group.") if group_names.empty?

  jwt = build_jwt
  app_id = app_id_for_bundle(jwt: jwt, bundle_id: bundle_id)
  build = build_for_metadata(
    jwt: jwt,
    app_id: app_id,
    build_number: build_number,
    marketing_version: marketing_version
  )
  required_tester = required_tester_email
  fail_with("TESTFLIGHT_REQUIRED_TESTER_EMAIL is required for TestFlight delivery proof") if required_tester.nil? || required_tester.empty?
  groups_by_name = beta_groups_by_name(jwt: jwt, app_id: app_id)
  tester_groups_by_name = tester_beta_groups_by_name(jwt: jwt, app_id: app_id, email: required_tester)
  available_group_names = (groups_by_name.keys + tester_groups_by_name.keys).uniq.sort
  missing_group_names = group_names.reject do |name|
    groups_by_name.key?(name) || tester_groups_by_name.key?(name)
  end

  if missing_group_names.empty?
    groups = group_names.map { |name| groups_by_name[name] || tester_groups_by_name.fetch(name) }
    verify_group_assignment(jwt: jwt, build_id: build.fetch("id"), groups: groups)
    verify_required_tester_membership(
      expected_group_names: group_names,
      tester_groups_by_name: tester_groups_by_name,
      email: required_tester
    )

    group_summary = groups.map { |group| group.dig("attributes", "name") }.join(", ")
    if required_tester
      puts("✅ Verified TestFlight build #{marketing_version} (#{build_number}) in beta groups #{group_summary} with tester #{required_tester}")
    else
      puts("✅ Verified TestFlight build #{marketing_version} (#{build_number}) in beta groups: #{group_summary}")
    end
  elsif available_group_names.empty?
    if group_names == [APP_STORE_CONNECT_USERS_GROUP]
      tester_emails = app_beta_tester_emails(jwt: jwt, app_id: app_id)
      unless required_tester && tester_emails.include?(required_tester)
        fail_with(
          "App Store Connect returned no app beta groups, and required TestFlight tester #{required_tester} " \
          "is not visible in this app's beta tester list for the #{APP_STORE_CONNECT_USERS_GROUP} auto-access path."
        )
      end

      puts(
        "✅ Verified TestFlight build #{marketing_version} (#{build_number}) via #{APP_STORE_CONNECT_USERS_GROUP} " \
        "auto-access with tester #{required_tester}"
      )
      return
    end

    fail_with(
      "App Store Connect exposed no visible beta groups for this app or required tester, so the verifier cannot prove configured TestFlight groups: #{group_names.join(', ')}. " \
      "Only the #{APP_STORE_CONNECT_USERS_GROUP} auto-access path is supported when App Store Connect exposes no visible beta groups."
    )
  else
    fail_with("Missing TestFlight beta groups: #{missing_group_names.join(', ')}. Available groups: #{available_group_names.join(', ')}")
  end
end

if $PROGRAM_NAME == __FILE__
  metadata_path = ARGV.fetch(0) do
    fail_with("Usage: #{$PROGRAM_NAME} path/to/testflight_build.json")
  end
  verify_testflight_build_delivery(metadata: read_metadata(metadata_path))
end
