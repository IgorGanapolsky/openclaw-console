package com.openclaw.console.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.openclaw.console.ui.AppViewModel
import com.openclaw.console.ui.screens.agents.AgentDetailScreen
import com.openclaw.console.ui.screens.agents.AgentListScreen
import com.openclaw.console.ui.screens.approvals.ApprovalDetailScreen
import com.openclaw.console.ui.screens.incidents.IncidentDetailScreen
import com.openclaw.console.ui.screens.incidents.IncidentListScreen
import com.openclaw.console.ui.screens.settings.AddGatewayScreen
import com.openclaw.console.ui.screens.settings.SettingsScreen
import com.openclaw.console.ui.screens.tasks.TaskDetailScreen

sealed class Screen(val route: String, val label: String) {
    // Bottom nav roots
    object Agents : Screen("agents", "Agents")
    object Incidents : Screen("incidents", "Incidents")
    object Settings : Screen("settings", "Settings")

    // Detail screens
    object AgentDetail : Screen("agents/{agentId}", "Agent") {
        fun route(agentId: String) = "agents/$agentId"
    }
    object TaskDetail : Screen("tasks/{agentId}/{taskId}", "Task") {
        fun route(agentId: String, taskId: String) = "tasks/$agentId/$taskId"
    }
    object IncidentDetail : Screen("incidents/{incidentId}", "Incident") {
        fun route(incidentId: String) = "incidents/$incidentId"
    }
    object ApprovalDetail : Screen("approvals/{approvalId}", "Approval") {
        fun route(approvalId: String) = "approvals/$approvalId"
    }
    object AddGateway : Screen("settings/add", "Add Gateway")
}

private data class BottomNavItem(
    val screen: Screen,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val badge: Int = 0
)

@Composable
fun NavGraph(appViewModel: AppViewModel = viewModel()) {
    val navController = rememberNavController()

    val pendingApprovalCount by appViewModel.pendingApprovalCount.collectAsState()
    val incidentRepository by appViewModel.incidentRepository.collectAsState()
    val openIncidentCount by remember(incidentRepository) {
        derivedStateOf {
            incidentRepository?.incidents?.value
                ?.count { it.status == com.openclaw.console.data.model.IncidentStatus.OPEN } ?: 0
        }
    }

    val bottomItems = listOf(
        BottomNavItem(Screen.Agents, Icons.Default.Groups),
        BottomNavItem(Screen.Incidents, Icons.Default.BugReport, openIncidentCount),
        BottomNavItem(Screen.Settings, Icons.Default.Settings, pendingApprovalCount)
    )

    Scaffold(
        bottomBar = {
            NavigationBar {
                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentDestination = navBackStackEntry?.destination

                bottomItems.forEach { item ->
                    NavigationBarItem(
                        selected = currentDestination?.hierarchy?.any { it.route == item.screen.route } == true,
                        onClick = {
                            navController.navigate(item.screen.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = {
                            if (item.badge > 0) {
                                BadgedBox(badge = {
                                    Badge { Text(item.badge.toString()) }
                                }) {
                                    Icon(item.icon, contentDescription = item.screen.label)
                                }
                            } else {
                                Icon(item.icon, contentDescription = item.screen.label)
                            }
                        },
                        label = { Text(item.screen.label) }
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Agents.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            // Agents
            composable(Screen.Agents.route) {
                AgentListScreen(
                    appViewModel = appViewModel,
                    onAgentClick = { agentId ->
                        navController.navigate(Screen.AgentDetail.route(agentId))
                    }
                )
            }

            composable(
                route = Screen.AgentDetail.route,
                arguments = listOf(navArgument("agentId") { type = NavType.StringType })
            ) { backStackEntry ->
                val agentId = backStackEntry.arguments?.getString("agentId") ?: return@composable
                AgentDetailScreen(
                    agentId = agentId,
                    appViewModel = appViewModel,
                    onTaskClick = { taskId ->
                        navController.navigate(Screen.TaskDetail.route(agentId, taskId))
                    },
                    onBack = { navController.navigateUp() }
                )
            }

            composable(
                route = Screen.TaskDetail.route,
                arguments = listOf(
                    navArgument("agentId") { type = NavType.StringType },
                    navArgument("taskId") { type = NavType.StringType }
                )
            ) { backStackEntry ->
                val agentId = backStackEntry.arguments?.getString("agentId") ?: return@composable
                val taskId = backStackEntry.arguments?.getString("taskId") ?: return@composable
                TaskDetailScreen(
                    agentId = agentId,
                    taskId = taskId,
                    appViewModel = appViewModel,
                    onBack = { navController.navigateUp() }
                )
            }

            // Incidents
            composable(Screen.Incidents.route) {
                IncidentListScreen(
                    appViewModel = appViewModel,
                    onIncidentClick = { incidentId ->
                        navController.navigate(Screen.IncidentDetail.route(incidentId))
                    }
                )
            }

            composable(
                route = Screen.IncidentDetail.route,
                arguments = listOf(navArgument("incidentId") { type = NavType.StringType })
            ) { backStackEntry ->
                val incidentId = backStackEntry.arguments?.getString("incidentId") ?: return@composable
                IncidentDetailScreen(
                    incidentId = incidentId,
                    appViewModel = appViewModel,
                    onBack = { navController.navigateUp() }
                )
            }

            // Settings
            composable(Screen.Settings.route) {
                SettingsScreen(
                    appViewModel = appViewModel,
                    onAddGateway = {
                        navController.navigate(Screen.AddGateway.route)
                    },
                    onApprovalClick = { approvalId ->
                        navController.navigate(Screen.ApprovalDetail.route(approvalId))
                    }
                )
            }

            composable(Screen.AddGateway.route) {
                AddGatewayScreen(
                    appViewModel = appViewModel,
                    onBack = { navController.navigateUp() }
                )
            }

            composable(
                route = Screen.ApprovalDetail.route,
                arguments = listOf(navArgument("approvalId") { type = NavType.StringType })
            ) { backStackEntry ->
                val approvalId = backStackEntry.arguments?.getString("approvalId") ?: return@composable
                ApprovalDetailScreen(
                    approvalId = approvalId,
                    appViewModel = appViewModel,
                    onBack = { navController.navigateUp() }
                )
            }
        }
    }
}
