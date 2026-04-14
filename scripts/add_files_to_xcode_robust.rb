require 'xcodeproj'
require 'pathname'

project_path = 'ios/OpenClawConsole/OpenClawConsole.xcodeproj'
project = Xcodeproj::Project.open(project_path)
target = project.targets.first

def add_file_robustly(project, target, file_path)
  app_root = File.expand_path('ios/OpenClawConsole/OpenClawConsole')
  full_path = File.expand_path(file_path)
  
  relative_path_from_app = Pathname.new(full_path).relative_path_from(Pathname.new(app_root)).to_s
  filename = File.basename(file_path)
  group_path = File.dirname(relative_path_from_app)

  # Remove existing reference if it exists to avoid duplicates/mess
  project.files.each do |f|
    if f.path == filename || f.path.end_with?(filename)
      f.remove_from_project
    end
  end

  # Find or create groups starting from the 'OpenClawConsole' main group
  main_app_group = project.main_group['OpenClawConsole']
  
  current_group = main_app_group
  unless group_path == '.'
    group_path.split('/').each do |g|
      # Find or create group AND set its path
      subgroup = current_group.groups.find { |grp| grp.name == g || grp.path == g }
      if subgroup.nil?
        subgroup = current_group.new_group(g, g) # name, path
      elsif subgroup.path.nil?
        subgroup.path = g
      end
      current_group = subgroup
    end
  end

  # Create file reference relative to the group
  file_ref = current_group.new_file(filename)
  
  # Add to build phase
  target.add_file_references([file_ref])
  
  puts "Successfully added #{filename} to group OpenClawConsole/#{group_path} with path alignment"
end

# Problematic files
problematic_files = [
  'ios/OpenClawConsole/OpenClawConsole/ViewModels/BridgeListViewModel.swift',
  'ios/OpenClawConsole/OpenClawConsole/ViewModels/LoopListViewModel.swift',
  'ios/OpenClawConsole/OpenClawConsole/ViewModels/GitViewModel.swift',
  'ios/OpenClawConsole/OpenClawConsole/Views/Bridges/BridgeListView.swift',
  'ios/OpenClawConsole/OpenClawConsole/Views/SubscriptionView.swift',
  'ios/OpenClawConsole/OpenClawConsole/Views/Loops/LoopListView.swift',
  'ios/OpenClawConsole/OpenClawConsole/Views/Git/GitBranchStatusView.swift',
  'ios/OpenClawConsole/OpenClawConsole/Views/Git/GitRepositoryView.swift',
  'ios/OpenClawConsole/OpenClawConsole/Views/Git/GitApprovalDetailView.swift',
  'ios/OpenClawConsole/OpenClawConsole/Services/SubscriptionService.swift'
]

problematic_files.each do |file|
  if File.exist?(file)
    add_file_robustly(project, target, file)
  else
    puts "❌ File not found: #{file}"
  end
end

project.save
puts "Project saved successfully."
