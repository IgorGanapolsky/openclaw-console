package com.openclaw.console.data.viewmodel

import com.openclaw.console.data.model.Agent
import com.openclaw.console.data.model.AgentStatus
import com.openclaw.console.data.model.GitState
import com.openclaw.console.data.repository.AgentRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.Assert.*
import org.mockito.Mock
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.*

@OptIn(ExperimentalCoroutinesApi::class)
class GitViewModelTest {

    @Mock
    private lateinit var mockAgentRepository: AgentRepository

    private lateinit var gitViewModel: GitViewModel
    private lateinit var testDispatcher: TestDispatcher
    private lateinit var testScope: TestScope

    private val testAgent = Agent(
        id = "test-agent-1",
        name = "Test Agent",
        description = "Test Agent Description",
        status = AgentStatus.ONLINE,
        workspace = "/test/workspace",
        tags = listOf("test"),
        lastActive = "2024-01-01T10:00:00Z",
        activeTasks = 2,
        pendingApprovals = 1,
        gitState = GitState(
            repository = "/test/workspace/.git",
            currentBranch = "feature/test",
            aheadCount = 3,
            behindCount = 1,
            uncommittedChanges = 2,
            lastCommitHash = "a1b2c3d4e5f6g7h8",
            lastCommitMessage = "Add test functionality",
            lastCommitTime = "2024-01-01T09:30:00Z"
        )
    )

    @Before
    fun setUp() {
        MockitoAnnotations.openMocks(this)
        testDispatcher = StandardTestDispatcher()
        testScope = TestScope(testDispatcher)
        Dispatchers.setMain(testDispatcher)

        // Setup mock repository
        whenever(mockAgentRepository.agents).thenReturn(MutableStateFlow(emptyList()))
        whenever(mockAgentRepository.isLoading).thenReturn(MutableStateFlow(false))
        whenever(mockAgentRepository.error).thenReturn(MutableStateFlow(null))

        gitViewModel = GitViewModel()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `setRepository should observe agents and update state`() = testScope.runTest {
        // Given
        val agentsFlow = MutableStateFlow(listOf(testAgent))
        whenever(mockAgentRepository.agents).thenReturn(agentsFlow)

        // When
        gitViewModel.setRepository(mockAgentRepository)
        testDispatcher.scheduler.advanceUntilIdle()

        // Then
        verify(mockAgentRepository).agents
        // Repository state should be updated when agent is set
    }

    @Test
    fun `setCurrentAgent should update repository state with correct agent`() = testScope.runTest {
        // Given
        val agentsFlow = MutableStateFlow(listOf(testAgent))
        whenever(mockAgentRepository.agents).thenReturn(agentsFlow)
        gitViewModel.setRepository(mockAgentRepository)

        // When
        gitViewModel.setCurrentAgent(testAgent.id)
        testDispatcher.scheduler.advanceUntilIdle()

        // Then
        val repositoryState = gitViewModel.repositoryUiState.value
        assertEquals(testAgent, repositoryState.agent)
        assertEquals(testAgent.gitState, repositoryState.gitState)
    }

    @Test
    fun `setCurrentAgent should update branch status state`() = testScope.runTest {
        // Given
        val agentsFlow = MutableStateFlow(listOf(testAgent))
        whenever(mockAgentRepository.agents).thenReturn(agentsFlow)
        gitViewModel.setRepository(mockAgentRepository)

        // When
        gitViewModel.setCurrentAgent(testAgent.id)
        testDispatcher.scheduler.advanceUntilIdle()

        // Then
        val branchState = gitViewModel.branchStatusUiState.value
        assertEquals(testAgent, branchState.agent)
        assertNotNull(branchState.currentBranch)
        assertEquals("feature/test", branchState.currentBranch?.name)
        assertTrue(branchState.currentBranch?.isActive == true)
        assertEquals(3, branchState.currentBranch?.aheadCount)
        assertEquals(1, branchState.currentBranch?.behindCount)
    }

    @Test
    fun `setCurrentAgent with unknown agent should handle gracefully`() = testScope.runTest {
        // Given
        val agentsFlow = MutableStateFlow(listOf(testAgent))
        whenever(mockAgentRepository.agents).thenReturn(agentsFlow)
        gitViewModel.setRepository(mockAgentRepository)

        // When
        gitViewModel.setCurrentAgent("unknown-agent")
        testDispatcher.scheduler.advanceUntilIdle()

        // Then
        val repositoryState = gitViewModel.repositoryUiState.value
        assertNull(repositoryState.agent)
        assertNull(repositoryState.gitState)
    }

    @Test
    fun `loadApprovalRequest should update approval detail state`() = testScope.runTest {
        // Given
        val requestId = "test-request-1"

        // When
        gitViewModel.loadApprovalRequest(requestId)
        testDispatcher.scheduler.advanceUntilIdle()

        // Then
        val approvalState = gitViewModel.approvalDetailUiState.value
        assertNotNull(approvalState.approvalRequest)
        assertEquals(requestId, approvalState.approvalRequest?.id)
        assertFalse(approvalState.isLoading)
    }

    @Test
    fun `selectDiff should update selected diff in approval state`() = testScope.runTest {
        // Given
        val testDiff = GitDiff(
            file = "test/file.kt",
            changeType = "modified",
            linesAdded = 10,
            linesRemoved = 5,
            content = "+added line\n-removed line"
        )

        // When
        gitViewModel.selectDiff(testDiff)

        // Then
        val approvalState = gitViewModel.approvalDetailUiState.value
        assertEquals(testDiff, approvalState.selectedDiff)
    }

    @Test
    fun `approveGitAction should set approval in progress and clear request`() = testScope.runTest {
        // Given
        val requestId = "test-request-1"
        gitViewModel.loadApprovalRequest(requestId)
        testDispatcher.scheduler.advanceUntilIdle()

        // When
        gitViewModel.approveGitAction(requestId)
        testDispatcher.scheduler.advanceTimeBy(1000) // Advance part way through approval

        // Then - should be in progress
        var approvalState = gitViewModel.approvalDetailUiState.value
        assertTrue(approvalState.approvalInProgress)

        // When - complete approval
        testDispatcher.scheduler.advanceUntilIdle()

        // Then - should be completed and cleared
        approvalState = gitViewModel.approvalDetailUiState.value
        assertFalse(approvalState.approvalInProgress)
        assertNull(approvalState.approvalRequest)
    }

    @Test
    fun `rejectGitAction should clear approval request`() = testScope.runTest {
        // Given
        val requestId = "test-request-1"
        val reason = "Changes look suspicious"
        gitViewModel.loadApprovalRequest(requestId)
        testDispatcher.scheduler.advanceUntilIdle()

        // When
        gitViewModel.rejectGitAction(requestId, reason)
        testDispatcher.scheduler.advanceUntilIdle()

        // Then
        val approvalState = gitViewModel.approvalDetailUiState.value
        assertNull(approvalState.approvalRequest)
    }

    @Test
    fun `refresh should call repository refresh and reload data`() = testScope.runTest {
        // Given
        val agentsFlow = MutableStateFlow(listOf(testAgent))
        whenever(mockAgentRepository.agents).thenReturn(agentsFlow)
        gitViewModel.setRepository(mockAgentRepository)
        gitViewModel.setCurrentAgent(testAgent.id)
        testDispatcher.scheduler.advanceUntilIdle()

        // When
        gitViewModel.refresh()
        testDispatcher.scheduler.advanceUntilIdle()

        // Then
        verify(mockAgentRepository, atLeastOnce()).refreshAgents()
    }

    @Test
    fun `clearError should clear errors from all states`() = testScope.runTest {
        // Given - simulate error state
        gitViewModel.setRepository(null) // This should trigger some error paths

        // When
        gitViewModel.clearError()

        // Then
        val repositoryState = gitViewModel.repositoryUiState.value
        val branchState = gitViewModel.branchStatusUiState.value
        val approvalState = gitViewModel.approvalDetailUiState.value

        assertNull(repositoryState.error)
        assertNull(branchState.error)
        assertNull(approvalState.error)
    }

    @Test
    fun `setRepository with null should clear all state`() = testScope.runTest {
        // Given - setup with valid repository
        val agentsFlow = MutableStateFlow(listOf(testAgent))
        whenever(mockAgentRepository.agents).thenReturn(agentsFlow)
        gitViewModel.setRepository(mockAgentRepository)
        gitViewModel.setCurrentAgent(testAgent.id)
        testDispatcher.scheduler.advanceUntilIdle()

        // When
        gitViewModel.setRepository(null)

        // Then
        val repositoryState = gitViewModel.repositoryUiState.value
        val branchState = gitViewModel.branchStatusUiState.value
        val approvalState = gitViewModel.approvalDetailUiState.value

        assertNull(repositoryState.agent)
        assertNull(repositoryState.gitState)
        assertTrue(repositoryState.branches.isEmpty())
        assertTrue(repositoryState.recentCommits.isEmpty())

        assertNull(branchState.agent)
        assertNull(branchState.currentBranch)
        assertTrue(branchState.commits.isEmpty())

        assertNull(approvalState.approvalRequest)
        assertNull(approvalState.selectedDiff)
    }

    @Test
    fun `agent without git state should handle gracefully`() = testScope.runTest {
        // Given
        val agentWithoutGit = testAgent.copy(gitState = null)
        val agentsFlow = MutableStateFlow(listOf(agentWithoutGit))
        whenever(mockAgentRepository.agents).thenReturn(agentsFlow)
        gitViewModel.setRepository(mockAgentRepository)

        // When
        gitViewModel.setCurrentAgent(agentWithoutGit.id)
        testDispatcher.scheduler.advanceUntilIdle()

        // Then
        val repositoryState = gitViewModel.repositoryUiState.value
        assertEquals(agentWithoutGit, repositoryState.agent)
        assertNull(repositoryState.gitState)

        val branchState = gitViewModel.branchStatusUiState.value
        assertEquals(agentWithoutGit, branchState.agent)
        assertNull(branchState.currentBranch)
    }
}