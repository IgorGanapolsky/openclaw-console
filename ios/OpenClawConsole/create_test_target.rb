#!/usr/bin/env ruby
# Script to add a test target to the OpenClawConsole Xcode project

require 'xcodeproj'

project_path = 'OpenClawConsole.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Find the main target
main_target = project.targets.find { |t| t.name == 'OpenClawConsole' }

unless main_target
  puts "Could not find main target 'OpenClawConsole'"
  exit 1
end

# Create test target
test_target = project.new_target(:unit_test_bundle, 'OpenClawConsoleTests', :ios, '17.0')

# Add test dependencies
test_target.add_dependency(main_target)

# Add test files group
test_group = project.main_group.new_group('Tests')

# Find test files
test_files = Dir.glob('Tests/**/*.swift')
test_files.each do |file|
  file_ref = test_group.new_reference(file)
  test_target.source_build_phase.add_file_reference(file_ref)
end

# Configure build settings
test_target.build_configurations.each do |config|
  config.build_settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
  config.build_settings['TEST_HOST'] = '$(BUILT_PRODUCTS_DIR)/OpenClawConsole.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/OpenClawConsole'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
end

# Save the project
project.save

puts "Successfully added test target to #{project_path}"