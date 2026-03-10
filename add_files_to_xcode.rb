require 'xcodeproj'
project_path = 'ios/OpenClawConsole/OpenClawConsole.xcodeproj'
project = Xcodeproj::Project.open(project_path)
target = project.targets.first

def add_file(project, target, file_path, group_path)
  group = project.main_group
  group_path.split('/').each do |g|
    group = group.groups.find { |grp| grp.name == g || grp.path == g } || group.new_group(g)
  end
  file_ref = group.new_file(file_path)
  target.source_build_phase.add_file_reference(file_ref)
  puts "Added #{file_path}"
end

add_file(project, target, 'OpenClawConsole/ViewModels/LoopListViewModel.swift', 'OpenClawConsole/ViewModels')
add_file(project, target, 'OpenClawConsole/Views/Loops/LoopListView.swift', 'OpenClawConsole/Views/Loops')

project.save
