#!/usr/bin/env ruby
# frozen_string_literal: true

require "base64"
require "cgi"
require "json"
require "net/http"
require "openssl"
require "time"
require "uri"

APP_STORE_CONNECT_BASE_URL = "https://api.appstoreconnect.apple.com".freeze

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

def base64url(value)
  Base64.urlsafe_encode64(value, padding: false)
end

def build_jwt
  key_id = first_present_env("APPSTORE_KEY_ID") || fail_with("APPSTORE_KEY_ID is required")
  issuer_id = first_present_env("APPSTORE_ISSUER_ID") || fail_with("APPSTORE_ISSUER_ID is required")
  private_key = first_present_env("APPSTORE_PRIVATE_KEY") || fail_with("APPSTORE_PRIVATE_KEY is required")

  header = { alg: "ES256", kid: key_id, typ: "JWT" }
  now = Time.now.to_i
  payload = { iss: issuer_id, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }
  signing_input = "#{base64url(header.to_json)}.#{base64url(payload.to_json)}"
  signature = OpenSSL::PKey.read(private_key).sign("sha256", signing_input)

  "#{signing_input}.#{base64url(signature)}"
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
    limit: 20,
    sort: "-uploadedDate"
  )
  response = request_json(jwt: jwt, method: :get, path: "/v1/builds?#{query}")
  pre_release_versions = response.fetch("included", []).each_with_object({}) do |item, memo|
    memo[item.fetch("id")] = item.dig("attributes", "version")
  end

  build = response.fetch("data", []).find do |item|
    item_build_number = item.dig("attributes", "version").to_s
    pre_release_id = item.dig("relationships", "preReleaseVersion", "data", "id")
    item_marketing_version = pre_release_versions[pre_release_id].to_s
    item_build_number == build_number.to_s && item_marketing_version == marketing_version.to_s
  end

  fail_with("No processed build found for #{marketing_version} (#{build_number}) in App Store Connect") unless build

  processing_state = build.dig("attributes", "processingState").to_s
  unless processing_state == "VALID"
    fail_with("Build #{marketing_version} (#{build_number}) is not ready for testing. processingState=#{processing_state}")
  end

  build
end

def beta_groups_for_names(jwt:, app_id:, group_names:)
  response = request_json(jwt: jwt, method: :get, path: "/v1/apps/#{app_id}/betaGroups?limit=200")
  groups_by_name = response.fetch("data", []).each_with_object({}) do |group, memo|
    memo[group.dig("attributes", "name")] = group
  end

  missing = group_names.reject { |name| groups_by_name.key?(name) }
  unless missing.empty?
    available = groups_by_name.keys.sort
    fail_with("Missing TestFlight beta groups: #{missing.join(', ')}. Available groups: #{available.join(', ')}")
  end

  group_names.map { |name| groups_by_name.fetch(name) }
end

def add_build_to_groups(jwt:, build_id:, group_ids:)
  payload = {
    data: group_ids.map { |group_id| { type: "betaGroups", id: group_id } }
  }
  request_json(
    jwt: jwt,
    method: :post,
    path: "/v1/builds/#{build_id}/relationships/betaGroups",
    payload: payload
  )
end

def verify_group_assignment(jwt:, build_id:, expected_group_ids:)
  response = request_json(jwt: jwt, method: :get, path: "/v1/builds/#{build_id}/relationships/betaGroups?limit=200")
  assigned_group_ids = response.fetch("data", []).map { |item| item.fetch("id") }
  missing_group_ids = expected_group_ids - assigned_group_ids
  fail_with("Build #{build_id} is missing beta group assignments: #{missing_group_ids.join(', ')}") unless missing_group_ids.empty?
end

metadata_path = ARGV.fetch(0) do
  fail_with("Usage: #{$PROGRAM_NAME} path/to/testflight_build.json")
end
metadata = read_metadata(metadata_path)
bundle_id = metadata.fetch("bundle_id")
marketing_version = metadata.fetch("marketing_version")
build_number = metadata.fetch("build_number").to_s
group_names = csv_items(first_present_env("TESTFLIGHT_GROUPS", "TESTFLIGHT_GROUPS_SECRET"))
fail_with("No TESTFLIGHT_GROUPS configured. Refusing to claim TestFlight delivery without an explicit beta group.") if group_names.empty?

jwt = build_jwt
app_id = app_id_for_bundle(jwt: jwt, bundle_id: bundle_id)
build = build_for_metadata(
  jwt: jwt,
  app_id: app_id,
  build_number: build_number,
  marketing_version: marketing_version
)
groups = beta_groups_for_names(jwt: jwt, app_id: app_id, group_names: group_names)
group_ids = groups.map { |group| group.fetch("id") }

add_build_to_groups(jwt: jwt, build_id: build.fetch("id"), group_ids: group_ids)
verify_group_assignment(jwt: jwt, build_id: build.fetch("id"), expected_group_ids: group_ids)

group_summary = groups.map { |group| group.dig("attributes", "name") }.join(", ")
puts("✅ Assigned TestFlight build #{marketing_version} (#{build_number}) to beta groups: #{group_summary}")
