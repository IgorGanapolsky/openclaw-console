package com.openclaw.console.ui.screens.approvals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openclaw.console.data.model.ApprovalDecision
import com.openclaw.console.data.model.ApprovalRequest
import com.openclaw.console.data.repository.ApprovalRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

enum class ApprovalScreenState {
    IDLE, BIOMETRIC_PROMPT, PROCESSING, SUCCESS, ERROR
}

data class ApprovalDetailUiState(
    val approval: ApprovalRequest? = null,
    val screenState: ApprovalScreenState = ApprovalScreenState.IDLE,
    val error: String? = null,
    val pendingDecision: ApprovalDecision? = null
)

class ApprovalViewModel : ViewModel() {

    private var approvalRepository: ApprovalRepository? = null
    private var currentApprovalId: String? = null

    private val _uiState = MutableStateFlow(ApprovalDetailUiState())
    val uiState: StateFlow<ApprovalDetailUiState> = _uiState

    fun init(approvalId: String, repo: ApprovalRepository?) {
        if (currentApprovalId == approvalId && approvalRepository == repo) return
        currentApprovalId = approvalId
        approvalRepository = repo
        _uiState.value = ApprovalDetailUiState(
            approval = repo?.getApproval(approvalId)
        )

        // Observe live changes to the approval list
        if (repo != null) {
            viewModelScope.launch {
                repo.pendingApprovals.collect { approvals ->
                    val approval = approvals.find { it.id == approvalId }
                    _uiState.value = _uiState.value.copy(approval = approval)
                }
            }
        }
    }

    fun onDecide(decision: ApprovalDecision) {
        _uiState.value = _uiState.value.copy(
            pendingDecision = decision,
            screenState = ApprovalScreenState.BIOMETRIC_PROMPT
        )
    }

    fun onBiometricSuccess() {
        val decision = _uiState.value.pendingDecision ?: return
        val approvalId = currentApprovalId ?: return
        _uiState.value = _uiState.value.copy(screenState = ApprovalScreenState.PROCESSING)

        viewModelScope.launch {
            approvalRepository?.respondToApproval(
                approvalId = approvalId,
                decision = decision,
                biometricVerified = true
            )?.onSuccess {
                _uiState.value = _uiState.value.copy(
                    screenState = ApprovalScreenState.SUCCESS,
                    error = null
                )
            }?.onFailure { e ->
                _uiState.value = _uiState.value.copy(
                    screenState = ApprovalScreenState.ERROR,
                    error = e.message ?: "Failed to submit response"
                )
            }
        }
    }

    fun onBiometricCancelled() {
        _uiState.value = _uiState.value.copy(
            screenState = ApprovalScreenState.IDLE,
            pendingDecision = null
        )
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null, screenState = ApprovalScreenState.IDLE)
    }
}
