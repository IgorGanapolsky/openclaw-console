package com.openclaw.console.ui.screens.approvals

import com.openclaw.console.data.model.*
import com.openclaw.console.data.repository.ApprovalRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Critical path tests for Android approval flow.
 * These tests verify the core Daily Active Approvers functionality works correctly.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ApprovalViewModelTest {

    private lateinit var viewModel: ApprovalViewModel
    private lateinit var mockRepository: MockApprovalRepository
    private lateinit var testDispatcher: TestDispatcher

    @Before
    fun setUp() {
        testDispatcher = UnconfinedTestDispatcher()
        Dispatchers.setMain(testDispatcher)
        mockRepository = MockApprovalRepository()
        viewModel = ApprovalViewModel()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state is idle with no approval`() {
        val state = viewModel.uiState.value

        assertEquals(ApprovalScreenState.IDLE, state.screenState)
        assertNull(state.approval)
        assertNull(state.error)
        assertNull(state.pendingDecision)
    }

    @Test
    fun `init loads approval from repository`() {
        // Given: Repository has an approval
        val approval = createMockApproval("test-123")
        mockRepository.approvals["test-123"] = approval

        // When: ViewModel is initialized
        viewModel.init("test-123", mockRepository)

        // Then: Approval is loaded into state
        val state = viewModel.uiState.value
        assertEquals(approval, state.approval)
    }

    @Test
    fun `onDecide sets pending decision and triggers biometric`() {
        // Given: ViewModel with an approval
        val approval = createMockApproval("test-456")
        mockRepository.approvals["test-456"] = approval
        viewModel.init("test-456", mockRepository)

        // When: User decides to approve
        viewModel.onDecide(ApprovalDecision.APPROVED)

        // Then: State shows biometric prompt with pending decision
        val state = viewModel.uiState.value
        assertEquals(ApprovalScreenState.BIOMETRIC_PROMPT, state.screenState)
        assertEquals(ApprovalDecision.APPROVED, state.pendingDecision)
    }

    @Test
    fun `successful biometric triggers approval processing`() {
        // Given: ViewModel with approval and pending decision
        val approval = createMockApproval("test-789")
        mockRepository.approvals["test-789"] = approval
        mockRepository.shouldSucceed = true
        viewModel.init("test-789", mockRepository)
        viewModel.onDecide(ApprovalDecision.APPROVED)

        // When: Biometric succeeds
        viewModel.onBiometricSuccess()

        // Then: Processing state is shown initially
        // Note: In real implementation, this would be async, but with UnconfinedTestDispatcher it completes immediately
        val state = viewModel.uiState.value
        assertEquals(ApprovalScreenState.SUCCESS, state.screenState)
        assertNull(state.error)

        // And: Repository received the approval
        assertEquals("test-789", mockRepository.lastRespondedId)
        assertEquals(ApprovalDecision.APPROVED, mockRepository.lastDecision)
        assertTrue(mockRepository.lastBiometricVerified)
    }

    @Test
    fun `failed approval shows error state`() {
        // Given: ViewModel with approval but repository will fail
        val approval = createMockApproval("test-fail")
        mockRepository.approvals["test-fail"] = approval
        mockRepository.shouldSucceed = false
        mockRepository.errorMessage = "Network error"
        viewModel.init("test-fail", mockRepository)
        viewModel.onDecide(ApprovalDecision.APPROVED)

        // When: Biometric succeeds but approval fails
        viewModel.onBiometricSuccess()

        // Then: Error state is shown
        val state = viewModel.uiState.value
        assertEquals(ApprovalScreenState.ERROR, state.screenState)
        assertEquals("Network error", state.error)
    }

    @Test
    fun `biometric cancellation resets to idle state`() {
        // Given: ViewModel in biometric prompt state
        viewModel.onDecide(ApprovalDecision.DENIED)
        assertEquals(ApprovalScreenState.BIOMETRIC_PROMPT, viewModel.uiState.value.screenState)

        // When: User cancels biometric
        viewModel.onBiometricCancelled()

        // Then: State returns to idle
        val state = viewModel.uiState.value
        assertEquals(ApprovalScreenState.IDLE, state.screenState)
        assertNull(state.pendingDecision)
    }

    @Test
    fun `clearError resets error state`() {
        // Given: ViewModel in error state
        viewModel.onError("Some error")
        assertEquals(ApprovalScreenState.ERROR, viewModel.uiState.value.screenState)
        assertEquals("Some error", viewModel.uiState.value.error)

        // When: Error is cleared
        viewModel.clearError()

        // Then: State returns to idle with no error
        val state = viewModel.uiState.value
        assertEquals(ApprovalScreenState.IDLE, state.screenState)
        assertNull(state.error)
    }

    @Test
    fun `deny decision works with biometric`() {
        // Given: ViewModel with approval
        val approval = createMockApproval("test-deny")
        mockRepository.approvals["test-deny"] = approval
        mockRepository.shouldSucceed = true
        viewModel.init("test-deny", mockRepository)

        // When: User decides to deny and completes biometric
        viewModel.onDecide(ApprovalDecision.DENIED)
        viewModel.onBiometricSuccess()

        // Then: Denial is processed successfully
        val state = viewModel.uiState.value
        assertEquals(ApprovalScreenState.SUCCESS, state.screenState)
        assertEquals(ApprovalDecision.DENIED, mockRepository.lastDecision)
    }

    // MARK: - Test Helpers

    private fun createMockApproval(id: String): ApprovalRequest {
        return ApprovalRequest(
            id = id,
            agentId = "test-agent",
            agentName = "Test Agent",
            actionType = ActionType.DEPLOY,
            title = "Deploy to production",
            description = "Deploy version 1.2.3 to production environment",
            command = "kubectl apply -f deployment.yaml",
            context = ApprovalContext(
                service = "api-server",
                environment = "production",
                repository = "company/api",
                riskLevel = RiskLevel.HIGH
            ),
            createdAt = "2024-01-01T12:00:00Z",
            expiresAt = "2024-01-01T13:00:00Z"
        )
    }
}

/**
 * Mock ApprovalRepository for testing
 */
class MockApprovalRepository : ApprovalRepository() {
    var approvals = mutableMapOf<String, ApprovalRequest>()
    var shouldSucceed = true
    var errorMessage = "Mock error"

    var lastRespondedId: String? = null
    var lastDecision: ApprovalDecision? = null
    var lastBiometricVerified: Boolean = false

    // Simulate repository state flows
    private val _pendingApprovals = MutableStateFlow<List<ApprovalRequest>>(emptyList())
    override val pendingApprovals = _pendingApprovals

    private val _isLoading = MutableStateFlow(false)
    override val isLoading = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    override val error = _error

    override suspend fun refreshPendingApprovals() {
        _isLoading.value = true
        if (shouldSucceed) {
            _pendingApprovals.value = approvals.values.toList()
        } else {
            _error.value = errorMessage
        }
        _isLoading.value = false
    }

    override suspend fun respondToApproval(
        approvalId: String,
        decision: ApprovalDecision,
        biometricVerified: Boolean
    ): Result<Unit> {
        lastRespondedId = approvalId
        lastDecision = decision
        lastBiometricVerified = biometricVerified

        return if (shouldSucceed) {
            // Remove from pending approvals on success
            approvals.remove(approvalId)
            _pendingApprovals.value = approvals.values.toList()
            Result.success(Unit)
        } else {
            Result.failure(Exception(errorMessage))
        }
    }

    override fun getApproval(approvalId: String): ApprovalRequest? {
        return approvals[approvalId]
    }

    override fun clearError() {
        _error.value = null
    }
}