package com.openclaw.console.data.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.console.data.model.Agent
import com.openclaw.console.data.model.GitState
import com.openclaw.console.data.repository.AgentRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class GitCommit(
    val hash: String,
    val shortHash: String,
    val message: String,
    val author: String,
    val timestamp: String,
    val branch: String? = null
)

data class GitBranch(
    val name: String,
    val isActive: Boolean,
    val lastCommit: GitCommit?,
    val aheadCount: Int = 0,
    val behindCount: Int = 0
)

data class GitDiff(
    val file: String,
    val changeType: String, // "added", "modified", "deleted"
    val linesAdded: Int,
    val linesRemoved: Int,
    val content: String
)

data class GitApprovalRequest(
    val id: String,
    val type: String, // "push", "merge", "rebase", "reset"
    val description: String,
    val targetBranch: String? = null,
    val sourceBranch: String? = null,
    val commits: List<GitCommit>,
    val diffs: List<GitDiff>,
    val riskLevel: String, // "low", "medium", "high"
    val timestamp: String
)

data class GitRepositoryUiState(
    val agent: Agent? = null,
    val gitState: GitState? = null,
    val branches: List<GitBranch> = emptyList(),
    val recentCommits: List<GitCommit> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)

data class GitBranchStatusUiState(
    val agent: Agent? = null,
    val currentBranch: GitBranch? = null,
    val commits: List<GitCommit> = emptyList(),
    val uncommittedFiles: List<String> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)

data class GitApprovalDetailUiState(
    val approvalRequest: GitApprovalRequest? = null,
    val selectedDiff: GitDiff? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
    val approvalInProgress: Boolean = false
)

class GitViewModel : ViewModel() {

    private var agentRepository: AgentRepository? = null
    private var _currentAgentId: String? = null

    private val _repositoryUiState = MutableStateFlow(GitRepositoryUiState())
    val repositoryUiState: StateFlow<GitRepositoryUiState> = _repositoryUiState

    private val _branchStatusUiState = MutableStateFlow(GitBranchStatusUiState())
    val branchStatusUiState: StateFlow<GitBranchStatusUiState> = _branchStatusUiState

    private val _approvalDetailUiState = MutableStateFlow(GitApprovalDetailUiState())
    val approvalDetailUiState: StateFlow<GitApprovalDetailUiState> = _approvalDetailUiState

    fun setRepository(repo: AgentRepository?) {
        if (repo == agentRepository) return
        agentRepository = repo
        if (repo != null) {
            observeAgents(repo)
        } else {
            clearAllState()
        }
    }

    private fun observeAgents(repo: AgentRepository) {
        viewModelScope.launch {
            repo.agents.collect { agents ->
                val currentAgent = _currentAgentId?.let { id ->
                    agents.find { it.id == id }
                }
                updateRepositoryState(currentAgent)
                updateBranchStatusState(currentAgent)
            }
        }
    }

    fun setCurrentAgent(agentId: String) {
        _currentAgentId = agentId
        viewModelScope.launch {
            val agent = agentRepository?.agents?.value?.find { it.id == agentId }
            updateRepositoryState(agent)
            updateBranchStatusState(agent)
            if (agent != null) {
                loadGitData(agent)
            }
        }
    }

    private fun updateRepositoryState(agent: Agent?) {
        _repositoryUiState.value = _repositoryUiState.value.copy(
            agent = agent,
            gitState = agent?.gitState
        )
    }

    private fun updateBranchStatusState(agent: Agent?) {
        val currentBranch = agent?.gitState?.currentBranch?.let { branchName ->
            GitBranch(
                name = branchName,
                isActive = true,
                lastCommit = agent.gitState.lastCommitHash?.let { hash ->
                    GitCommit(
                        hash = hash,
                        shortHash = hash.take(8),
                        message = agent.gitState.lastCommitMessage ?: "",
                        author = "", // Would be fetched from detailed git info
                        timestamp = agent.gitState.lastCommitTime ?: ""
                    )
                },
                aheadCount = agent.gitState.aheadCount,
                behindCount = agent.gitState.behindCount
            )
        }

        _branchStatusUiState.value = _branchStatusUiState.value.copy(
            agent = agent,
            currentBranch = currentBranch
        )
    }

    private fun loadGitData(agent: Agent) {
        viewModelScope.launch {
            _repositoryUiState.value = _repositoryUiState.value.copy(isLoading = true)
            _branchStatusUiState.value = _branchStatusUiState.value.copy(isLoading = true)

            try {
                // In a real implementation, these would be API calls to fetch detailed git info
                loadBranches(agent.id)
                loadRecentCommits(agent.id)
                loadCommitHistory(agent.id)

                _repositoryUiState.value = _repositoryUiState.value.copy(isLoading = false)
                _branchStatusUiState.value = _branchStatusUiState.value.copy(isLoading = false)
            } catch (e: Exception) {
                _repositoryUiState.value = _repositoryUiState.value.copy(
                    isLoading = false,
                    error = e.message
                )
                _branchStatusUiState.value = _branchStatusUiState.value.copy(
                    isLoading = false,
                    error = e.message
                )
            }
        }
    }

    private suspend fun loadBranches(agentId: String) {
        // Mock data - in real implementation, this would call the gateway API
        val branches = listOf(
            GitBranch(
                name = "main",
                isActive = false,
                lastCommit = GitCommit(
                    hash = "a1b2c3d4",
                    shortHash = "a1b2c3d4",
                    message = "Initial commit",
                    author = "developer@openclaw.com",
                    timestamp = "2024-01-01T10:00:00Z"
                )
            ),
            GitBranch(
                name = "feature/git-ui",
                isActive = true,
                lastCommit = GitCommit(
                    hash = "e5f6g7h8",
                    shortHash = "e5f6g7h8",
                    message = "Add git UI components",
                    author = "developer@openclaw.com",
                    timestamp = "2024-01-02T14:30:00Z"
                ),
                aheadCount = 3,
                behindCount = 1
            )
        )

        _repositoryUiState.value = _repositoryUiState.value.copy(branches = branches)
    }

    private suspend fun loadRecentCommits(agentId: String) {
        // Mock data - in real implementation, this would call the gateway API
        val commits = listOf(
            GitCommit(
                hash = "e5f6g7h8",
                shortHash = "e5f6g7h8",
                message = "Add git UI components",
                author = "developer@openclaw.com",
                timestamp = "2024-01-02T14:30:00Z",
                branch = "feature/git-ui"
            ),
            GitCommit(
                hash = "d4e5f6g7",
                shortHash = "d4e5f6g7",
                message = "Update navigation for git screens",
                author = "developer@openclaw.com",
                timestamp = "2024-01-02T12:15:00Z",
                branch = "feature/git-ui"
            ),
            GitCommit(
                hash = "c3d4e5f6",
                shortHash = "c3d4e5f6",
                message = "Add git data models",
                author = "developer@openclaw.com",
                timestamp = "2024-01-02T10:45:00Z",
                branch = "feature/git-ui"
            )
        )

        _repositoryUiState.value = _repositoryUiState.value.copy(recentCommits = commits)
    }

    private suspend fun loadCommitHistory(agentId: String) {
        // Mock data - in real implementation, this would call the gateway API
        val commits = listOf(
            GitCommit(
                hash = "e5f6g7h8",
                shortHash = "e5f6g7h8",
                message = "Add git UI components",
                author = "developer@openclaw.com",
                timestamp = "2024-01-02T14:30:00Z"
            ),
            GitCommit(
                hash = "d4e5f6g7",
                shortHash = "d4e5f6g7",
                message = "Update navigation for git screens",
                author = "developer@openclaw.com",
                timestamp = "2024-01-02T12:15:00Z"
            ),
            GitCommit(
                hash = "c3d4e5f6",
                shortHash = "c3d4e5f6",
                message = "Add git data models",
                author = "developer@openclaw.com",
                timestamp = "2024-01-02T10:45:00Z"
            )
        )

        _branchStatusUiState.value = _branchStatusUiState.value.copy(commits = commits)
    }

    fun loadApprovalRequest(requestId: String) {
        viewModelScope.launch {
            _approvalDetailUiState.value = _approvalDetailUiState.value.copy(isLoading = true)

            try {
                // Mock data - in real implementation, this would call the gateway API
                val approvalRequest = GitApprovalRequest(
                    id = requestId,
                    type = "push",
                    description = "Push 3 commits to origin/feature/git-ui",
                    targetBranch = "origin/feature/git-ui",
                    sourceBranch = "feature/git-ui",
                    commits = listOf(
                        GitCommit(
                            hash = "e5f6g7h8",
                            shortHash = "e5f6g7h8",
                            message = "Add git UI components",
                            author = "developer@openclaw.com",
                            timestamp = "2024-01-02T14:30:00Z"
                        )
                    ),
                    diffs = listOf(
                        GitDiff(
                            file = "android/app/src/main/java/com/openclaw/console/ui/screens/git/GitRepositoryScreen.kt",
                            changeType = "added",
                            linesAdded = 150,
                            linesRemoved = 0,
                            content = "+package com.openclaw.console.ui.screens.git\n+\n+import androidx.compose.foundation.layout.*"
                        )
                    ),
                    riskLevel = "low",
                    timestamp = "2024-01-02T14:30:00Z"
                )

                _approvalDetailUiState.value = _approvalDetailUiState.value.copy(
                    approvalRequest = approvalRequest,
                    isLoading = false
                )
            } catch (e: Exception) {
                _approvalDetailUiState.value = _approvalDetailUiState.value.copy(
                    isLoading = false,
                    error = e.message
                )
            }
        }
    }

    fun selectDiff(diff: GitDiff) {
        _approvalDetailUiState.value = _approvalDetailUiState.value.copy(selectedDiff = diff)
    }

    fun approveGitAction(requestId: String) {
        viewModelScope.launch {
            _approvalDetailUiState.value = _approvalDetailUiState.value.copy(approvalInProgress = true)

            try {
                // In real implementation, this would call the gateway API with biometric verification
                // For now, just simulate the approval process
                kotlinx.coroutines.delay(2000) // Simulate network call

                _approvalDetailUiState.value = _approvalDetailUiState.value.copy(
                    approvalInProgress = false,
                    approvalRequest = null // Clear after approval
                )
            } catch (e: Exception) {
                _approvalDetailUiState.value = _approvalDetailUiState.value.copy(
                    approvalInProgress = false,
                    error = e.message
                )
            }
        }
    }

    fun rejectGitAction(requestId: String, reason: String) {
        viewModelScope.launch {
            try {
                // In real implementation, this would call the gateway API
                _approvalDetailUiState.value = _approvalDetailUiState.value.copy(
                    approvalRequest = null // Clear after rejection
                )
            } catch (e: Exception) {
                _approvalDetailUiState.value = _approvalDetailUiState.value.copy(
                    error = e.message
                )
            }
        }
    }

    fun refresh() {
        _currentAgentId?.let { agentId ->
            agentRepository?.let { repo ->
                viewModelScope.launch {
                    repo.refreshAgents()
                    val agent = repo.agents.value.find { it.id == agentId }
                    if (agent != null) {
                        loadGitData(agent)
                    }
                }
            }
        }
    }

    fun clearError() {
        _repositoryUiState.value = _repositoryUiState.value.copy(error = null)
        _branchStatusUiState.value = _branchStatusUiState.value.copy(error = null)
        _approvalDetailUiState.value = _approvalDetailUiState.value.copy(error = null)
    }

    private fun clearAllState() {
        _repositoryUiState.value = GitRepositoryUiState()
        _branchStatusUiState.value = GitBranchStatusUiState()
        _approvalDetailUiState.value = GitApprovalDetailUiState()
        _currentAgentId = null
    }
}