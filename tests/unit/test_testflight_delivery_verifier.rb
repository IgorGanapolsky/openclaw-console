require "minitest/autorun"
require "stringio"
require_relative "../../scripts/assign_testflight_build_to_groups"

class TestFlightDeliveryVerifierTest < Minitest::Test
  METADATA = {
    "bundle_id" => "com.openclaw.console",
    "marketing_version" => "1.0.0",
    "build_number" => "123"
  }.freeze

  def test_succeeds_when_required_group_contains_build_and_tester
    verifier = build_verifier(
      group_names: ["Internal QA"],
      required_tester: "tester@example.com",
      collection_map: {
        "/v1/betaGroups?filter%5Bapp%5D=app-id&limit=200" => [
          { "id" => "group-build", "attributes" => { "name" => "Internal QA" } }
        ],
        "/v1/betaGroups/group-build/builds?limit=200" => [
          { "id" => "build-id" }
        ]
      },
      response_map: {
        "/v1/betaTesters?filter%5Bapps%5D=app-id&filter%5Bemail%5D=tester%40example.com&include=betaGroups&limit=200" => {
          "data" => [
            {
              "relationships" => {
                "betaGroups" => {
                  "data" => [
                    { "id" => "group-build" }
                  ]
                }
              }
            }
          ],
          "included" => [
            { "id" => "group-build", "type" => "betaGroups", "attributes" => { "name" => "Internal QA" } }
          ]
        }
      }
    )

    stdout, = capture_io do
      verifier.send(:verify_testflight_build_delivery, metadata: METADATA)
    end

    assert_includes stdout, "in beta groups Internal QA"
    assert_includes stdout, "tester tester@example.com"
  end

  def test_succeeds_via_app_store_connect_users_auto_access_when_app_groups_are_not_visible
    verifier = build_verifier(
      group_names: ["App Store Connect Users"],
      required_tester: "tester@example.com",
      collection_map: {
        "/v1/betaGroups?filter%5Bapp%5D=app-id&limit=200" => [],
        "/v1/apps/app-id/betaTesters?limit=200" => [
          { "attributes" => { "email" => "tester@example.com" } }
        ]
      },
      response_map: {
        "/v1/betaTesters?filter%5Bapps%5D=app-id&filter%5Bemail%5D=tester%40example.com&include=betaGroups&limit=200" => {
          "data" => [],
          "included" => []
        }
      }
    )

    stdout, = capture_io do
      verifier.send(:verify_testflight_build_delivery, metadata: METADATA)
    end

    assert_includes stdout, "via App Store Connect Users auto-access"
    assert_includes stdout, "tester tester@example.com"
  end

  def test_fails_when_required_group_is_missing_build_assignment
    verifier = build_verifier(
      group_names: ["Internal QA"],
      required_tester: "tester@example.com",
      collection_map: {
        "/v1/betaGroups?filter%5Bapp%5D=app-id&limit=200" => [
          { "id" => "group-build", "attributes" => { "name" => "Internal QA" } }
        ],
        "/v1/betaGroups/group-build/builds?limit=200" => []
      },
      response_map: {
        "/v1/betaTesters?filter%5Bapps%5D=app-id&filter%5Bemail%5D=tester%40example.com&include=betaGroups&limit=200" => {
          "data" => [
            {
              "relationships" => {
                "betaGroups" => {
                  "data" => [
                    { "id" => "group-build" }
                  ]
                }
              }
            }
          ],
          "included" => [
            { "id" => "group-build", "type" => "betaGroups", "attributes" => { "name" => "Internal QA" } }
          ]
        }
      }
    )

    error = assert_raises(RuntimeError) do
      verifier.send(:verify_testflight_build_delivery, metadata: METADATA)
    end

    assert_includes error.message, "Build build-id is missing beta group assignments: Internal QA"
  end

  def test_succeeds_when_required_tester_exposes_group_membership_without_app_group_listing
    verifier = build_verifier(
      group_names: ["Internal QA"],
      required_tester: "tester@example.com",
      collection_map: {
        "/v1/betaGroups?filter%5Bapp%5D=app-id&limit=200" => [],
        "/v1/betaGroups/group-build/builds?limit=200" => [
          { "id" => "build-id" }
        ]
      },
      response_map: {
        "/v1/betaTesters?filter%5Bapps%5D=app-id&filter%5Bemail%5D=tester%40example.com&include=betaGroups&limit=200" => {
          "data" => [
            {
              "relationships" => {
                "betaGroups" => {
                  "data" => [
                    { "id" => "group-build" }
                  ]
                }
              }
            }
          ],
          "included" => [
            { "id" => "group-build", "type" => "betaGroups", "attributes" => { "name" => "Internal QA" } }
          ]
        }
      }
    )

    stdout, = capture_io do
      verifier.send(:verify_testflight_build_delivery, metadata: METADATA)
    end

    assert_includes stdout, "in beta groups Internal QA"
    assert_includes stdout, "tester tester@example.com"
  end

  def test_fails_when_custom_groups_are_not_visible_anywhere
    verifier = build_verifier(
      group_names: ["Internal QA"],
      required_tester: "tester@example.com",
      collection_map: {
        "/v1/betaGroups?filter%5Bapp%5D=app-id&limit=200" => []
      },
      response_map: {
        "/v1/betaTesters?filter%5Bapps%5D=app-id&filter%5Bemail%5D=tester%40example.com&include=betaGroups&limit=200" => {
          "data" => [
            {
              "relationships" => {
                "betaGroups" => {
                  "data" => []
                }
              }
            }
          ],
          "included" => []
        }
      }
    )

    error = assert_raises(RuntimeError) do
      verifier.send(:verify_testflight_build_delivery, metadata: METADATA)
    end

    assert_includes error.message, "App Store Connect exposed no visible beta groups"
    assert_includes error.message, "Internal QA"
    assert_includes error.message, "App Store Connect Users auto-access path"
  end

  def test_fails_when_app_store_connect_users_auto_access_missing_required_tester
    verifier = build_verifier(
      group_names: ["App Store Connect Users"],
      required_tester: "tester@example.com",
      collection_map: {
        "/v1/betaGroups?filter%5Bapp%5D=app-id&limit=200" => [],
        "/v1/apps/app-id/betaTesters?limit=200" => []
      },
      response_map: {
        "/v1/betaTesters?filter%5Bapps%5D=app-id&filter%5Bemail%5D=tester%40example.com&include=betaGroups&limit=200" => {
          "data" => [],
          "included" => []
        }
      }
    )

    error = assert_raises(RuntimeError) do
      verifier.send(:verify_testflight_build_delivery, metadata: METADATA)
    end

    assert_includes error.message, "required TestFlight tester tester@example.com"
    assert_includes error.message, "App Store Connect Users auto-access path"
  end

  private

  def build_verifier(group_names:, required_tester:, collection_map:, response_map: {})
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
      response_map.fetch(path) do
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
