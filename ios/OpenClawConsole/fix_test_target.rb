#!/usr/bin/env ruby
# Script to properly fix the test target in the OpenClawConsole Xcode project

require 'xcodeproj'

project_path = 'OpenClawConsole.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Remove the broken test target first
broken_target = project.targets.find { |t| t.name == 'OpenClawConsoleTests' }
if broken_target
  puts "Removing broken test target..."
  project.targets.delete(broken_target)
end

# Find the main target
main_target = project.targets.find { |t| t.name == 'OpenClawConsole' }

unless main_target
  puts "Could not find main target 'OpenClawConsole'"
  exit 1
end

# Create a proper test target
puts "Creating proper test target..."
test_target = project.new_target(:unit_test_bundle, 'OpenClawConsoleTests', :ios, '17.0')

# Add test dependencies
test_target.add_dependency(main_target)

# Find or create test group
test_group = project.main_group['Tests'] || project.main_group.new_group('Tests')

# Add only the test files (not the main app sources)
test_files = Dir.glob('Tests/**/*.swift')
if test_files.empty?
  puts "Warning: No test files found in Tests/ directory"
end

test_files.each do |file|
  puts "Adding test file: #{file}"
  file_ref = test_group.new_reference(file)
  test_target.source_build_phase.add_file_reference(file_ref)
end

# Configure build settings properly for unit tests
test_target.build_configurations.each do |config|
  config.build_settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
  config.build_settings['TEST_HOST'] = '$(BUILT_PRODUCTS_DIR)/OpenClawConsole.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/OpenClawConsole'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.openclaw.console.tests'
  config.build_settings['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'YES'
end

# Save the project
project.save

puts "Successfully fixed test target in #{project_path}"