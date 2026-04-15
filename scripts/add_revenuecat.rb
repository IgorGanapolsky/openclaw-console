require 'xcodeproj'

project_path = 'ios/OpenClawConsole/OpenClawConsole.xcodeproj'
project = Xcodeproj::Project.open(project_path)

package_url = 'https://github.com/RevenueCat/purchases-ios.git'

# Check if already exists
package_ref = project.root_object.package_references.find { |p| p.repositoryURL == package_url }
if package_ref
  puts "Swift Package already exists: #{package_url}"
else
  package_ref = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
  package_ref.repositoryURL = package_url
  package_ref.requirement = {
    'kind' => 'upToNextMajorVersion',
    'minimumVersion' => '5.0.0'
  }
  project.root_object.package_references << package_ref
  puts "Added Swift Package: #{package_url}"
end

target = project.targets.find { |t| t.name == 'OpenClawConsole' }
product_name = 'RevenueCat'

# Check if product already linked
product_ref = target.package_product_dependencies.find { |p| p.product_name == product_name }
if product_ref
  puts "Package Product already linked: #{product_name}"
else
  product_ref = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
  product_ref.package = package_ref
  product_ref.product_name = product_name
  target.package_product_dependencies << product_ref
  puts "Linked Package Product: #{product_name}"
end

project.save
puts "Project saved successfully."
