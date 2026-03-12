require "minitest/autorun"
require "stringio"
require_relative "../../scripts/assign_testflight_build_to_groups"

class TestFlightDeliveryVerifierTest < Minitest::Test
  METADATA = {
    "bundle_id" => "com.openclaw.console",
    "marketing_version" => "1.0.0",
    "build_number" => "123"
  }.freeze

  def test_succeeds_via_build_beta_groups_when_app_group_listing_is_empty
    verifier = build_verifier(
      group_names: ["Internal QA"],
      required_tester: "tester@example.com",
      collection_map: {
        "/v1/apps/app-id/betaGroups?limit=200" => [],
        "/v1/builds/build-id/relationships/betaGroups?limit=200" => [
          { "id" => "group-build" }
        ],
        "/v1/betaGroups/group-build/betaTesters?limit=200" => [
          { "attributes" => { "email" => "tester@example.com" } }
        ]
      },
      request_map: {
        "/v1/betaGroups/group-build" => {
          "data" => {
            "id" => "group-build",
            "attributes" => { "name" => "App Store Connect Users" }
          }
        }
      }
    )

    stdout, = capture_io do
      verifier.send(:verify_testflight_build_delivery, metadata: METADATA)
    end

    assert_includes stdout, "via build beta groups App Store Connect Users"
    assert_includes stdout, "tester tester@example.com"
  end

  def test_succeeds_via_direct_tester_assignment_when_no_group_relationships_exist
    verifier = build_verifier(
      group_names: ["Internal QA"],
      required_tester: "tester@example.com",
      collection_map: {
        "/v1/apps/app-id/betaGroups?limit=200" => [],
        "/v1/builds/build-id/relationships/betaGroups?limit=200" => [],
        "/v1/builds/build-id/individualTesters?limit=200" => [
          { "attributes" => { "email" => "tester@example.com" } }
        ]
      }
    )

    stdout, = capture_io do
      verifier.send(:verify_testflight_build_delivery, metadata: METADATA)
    end

    assert_includes stdout, "via direct tester assignment"
    assert_includes stdout, "tester@example.com"
  end

  def test_fails_when_neither_group_nor_individual_assignment_proves_access
    verifier = build_verifier(
      group_names: ["Internal QA"],
      required_tester: "tester@example.com",
      collection_map: {
        "/v1/apps/app-id/betaGroups?limit=200" => [],
        "/v1/builds/build-id/relationships/betaGroups?limit=200" => [],
        "/v1/builds/build-id/individualTesters?limit=200" => []
      }
    )

    error = assert_raises(RuntimeError) do
      verifier.send(:verify_testflight_build_delivery, metadata: METADATA)
    end

    assert_includes error.message, "no beta groups for this app or build"
    assert_includes error.message, "tester@example.com"
  end

  private

  def build_verifier(group_names:, required_tester:, collection_map:, request_map: {})
    verifier = Object.new

    verifier.define_singleton_method(:strict_csv_env) do |primary_name, _secondary_name|
      case primary_name
      when "TESTFLIGHT_GROUPS_SECRET"
        group_names
      when "TESTFLIGHT_REQUIRED_TESTER_EMAIL_SECRET"
        [required_tester]
      else
        []
      end
    end

    verifier.define_singleton_method(:build_jwt) { "jwt" }
    verifier.define_singleton_method(:app_id_for_bundle) { |jwt:, bundle_id:| "app-id" }
    verifier.define_singleton_method(:build_for_metadata) do |jwt:, app_id:, build_number:, marketing_version:|
      { "id" => "build-id" }
    end

    verifier.define_singleton_method(:request_json_collection) do |jwt:, path:|
      collection_map.fetch(path) do
        raise "Unexpected collection path: #{path}"
      end
    end

    verifier.define_singleton_method(:request_json) do |jwt:, method:, path:, payload: nil|
      request_map.fetch(path) do
        raise "Unexpected request path: #{path}"
      end
    end

    verifier.define_singleton_method(:fail_with) do |message|
      raise RuntimeError, message
    end

    verifier
  end

  def capture_io
    captured_stdout = StringIO.new
    captured_stderr = StringIO.new
    original_stdout = $stdout
    original_stderr = $stderr
    $stdout = captured_stdout
    $stderr = captured_stderr
    yield
    [captured_stdout.string, captured_stderr.string]
  ensure
    $stdout = original_stdout
    $stderr = original_stderr
  end
end
