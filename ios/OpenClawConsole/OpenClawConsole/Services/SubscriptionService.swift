import Foundation
import Observation
import Combine
import RevenueCat
import LocalAuthentication

/// Subscription tiers supported by OpenClaw Console
@available(iOS 17.0, *)
public enum SubscriptionTier: String, CaseIterable, Codable {
    case free = "free"
    case proMonthly = "pro_monthly"
    case proYearly = "pro_yearly"

    var displayName: String {
        switch self {
        case .free: return "Free"
        case .proMonthly: return "Pro Monthly"
        case .proYearly: return "Pro Yearly"
        }
    }
}

/// Subscription status information
@available(iOS 17.0, *)
public struct SubscriptionStatus: Equatable {
    public let tier: SubscriptionTier
    public let isActive: Bool
    public let willRenew: Bool
    public let expirationDate: Date?
    public let productIdentifier: String?
    public let originalTransactionId: String?
    public let hasProEntitlement: Bool

    public init(
        tier: SubscriptionTier = .free,
        isActive: Bool = false,
        willRenew: Bool = false,
        expirationDate: Date? = nil,
        productIdentifier: String? = nil,
        originalTransactionId: String? = nil,
        hasProEntitlement: Bool = false
    ) {
        self.tier = tier
        self.isActive = isActive
        self.willRenew = willRenew
        self.expirationDate = expirationDate
        self.productIdentifier = productIdentifier
        self.originalTransactionId = originalTransactionId
        self.hasProEntitlement = hasProEntitlement
    }
}

/// Purchase result for UI handling
@available(iOS 17.0, *)
public enum PurchaseResult {
    case success
    case error(String)
    case userCancelled
}

/// Main subscription service managing RevenueCat integration
@available(iOS 17.0, *)
@Observable
public final class SubscriptionService: NSObject, PurchasesDelegate {

    // MARK: - Constants

    private static let proEntitlementId = "pro"
    private static let proMonthlyProductId = "com.openclaw.console.pro.monthly"
    private static let proYearlyProductId = "com.openclaw.console.pro.yearly"

    // MARK: - Published Properties

    public private(set) var subscriptionStatus = SubscriptionStatus()
    public private(set) var isLoading = false
    public private(set) var currentOfferings: Offerings?

    // MARK: - Private Properties

    private let keychainService: KeychainService
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization
    public init(keychainService: KeychainService = KeychainService.shared) {
        self.keychainService = keychainService
        super.init()
        setupRevenueCat()
    }

    // MARK: - Public Methods

    /// Initialize RevenueCat with API key
    public func configure(apiKey: String, userId: String? = nil) {
        do {
            Purchases.logLevel = .debug

            let configuration = Configuration.Builder(withAPIKey: apiKey)
                .with(appUserID: userId)
                .build()

            Purchases.configure(with: configuration)

            // Set up customer info update listener
            Purchases.shared.delegate = self

            print("[SubscriptionService] RevenueCat configured successfully")

            // Load initial data
            Task {
                await refreshSubscriptionStatus()
                await loadOfferings()
            }

        } catch {
            print("[SubscriptionService] Failed to configure RevenueCat: \(error)")
        }
    }

    /// Purchase Pro subscription
    @MainActor
    public func purchaseProSubscription(yearly: Bool = false) async -> PurchaseResult {
        guard let offerings = currentOfferings,
              let currentOffering = offerings.current else {
            return .error("No subscription packages available")
        }

        let package: Package?
        if yearly {
            package = currentOffering.annual ?? currentOffering.availablePackages.first {
                $0.storeProduct.productIdentifier == Self.proYearlyProductId
            }
        } else {
            package = currentOffering.monthly ?? currentOffering.availablePackages.first {
                $0.storeProduct.productIdentifier == Self.proMonthlyProductId
            }
        }

        guard let packageToPurchase = package else {
            return .error("Subscription package not available")
        }

        return await purchasePackage(packageToPurchase)
    }

    /// Purchase a specific package
    @MainActor
    public func purchasePackage(_ package: Package) async -> PurchaseResult {
        isLoading = true
        defer { isLoading = false }

        do {
            let result = try await Purchases.shared.purchase(package: package)

            print("[SubscriptionService] Purchase successful")
            await updateSubscriptionStatus(result.customerInfo)

            return .success

        } catch let error as ErrorCode {
            print("[SubscriptionService] Purchase failed: \(error)")

            switch error {
            case .purchaseCancelledError:
                return .userCancelled
            case .storeProblemError:
                return .error("Store problem occurred")
            case .purchaseNotAllowedError:
                return .error("Purchase not allowed")
            case .purchaseInvalidError:
                return .error("Invalid purchase")
            default:
                return .error(error.localizedDescription)
            }

        } catch {
            print("[SubscriptionService] Unexpected purchase error: \(error)")
            return .error("Purchase failed: \(error.localizedDescription)")
        }
    }

    /// Restore purchases
    @MainActor
    public func restorePurchases() async -> PurchaseResult {
        isLoading = true
        defer { isLoading = false }

        do {
            let customerInfo = try await Purchases.shared.restorePurchases()

            print("[SubscriptionService] Purchases restored successfully")
            await updateSubscriptionStatus(customerInfo)

            return .success

        } catch {
            print("[SubscriptionService] Failed to restore purchases: \(error)")
            return .error("Failed to restore purchases: \(error.localizedDescription)")
        }
    }

    /// Check if user has Pro entitlement
    public func checkEntitlements() -> Bool {
        return subscriptionStatus.hasProEntitlement
    }

    /// Check Pro feature access
    public func checkProFeatureAccess(feature: String) -> Bool {
        let hasProAccess = checkEntitlements()

        print("[SubscriptionService] Checking access for feature '\(feature)': \(hasProAccess)")

        switch feature {
        // Free tier features (always allowed)
        case "basic_approvals", "agent_monitoring", "simple_notifications":
            return true

        // Pro features require active subscription
        case "devops_integrations", "advanced_analytics", "custom_webhooks",
             "priority_support", "unlimited_agents":
            return hasProAccess

        // Unknown features default to free
        default:
            print("[SubscriptionService] Unknown feature access check: \(feature)")
            return true
        }
    }

    /// Refresh subscription status from RevenueCat
    @MainActor
    public func refreshSubscriptionStatus() async {
        do {
            let customerInfo = try await Purchases.shared.customerInfo()
            await updateSubscriptionStatus(customerInfo)

        } catch {
            print("[SubscriptionService] Failed to refresh customer info: \(error)")
            // Load cached status if available
            loadCachedSubscriptionStatus()
        }
    }

    /// Load offerings from RevenueCat
    @MainActor
    private func loadOfferings() async {
        do {
            currentOfferings = try await Purchases.shared.offerings()
            print("[SubscriptionService] Offerings loaded successfully")

        } catch {
            print("[SubscriptionService] Failed to load offerings: \(error)")
        }
    }

    // MARK: - Private Methods

    private func setupRevenueCat() {
        // Additional RevenueCat configuration can go here
        print("[SubscriptionService] Setting up RevenueCat integration")
    }

    @MainActor
    private func updateSubscriptionStatus(_ customerInfo: CustomerInfo) async {
        let proEntitlement = customerInfo.entitlements[Self.proEntitlementId]
        let hasProEntitlement = proEntitlement?.isActive == true

        let activeSubscriptions = Array(customerInfo.activeSubscriptions)
        let isActive = !activeSubscriptions.isEmpty

        // Determine subscription tier
        let tier: SubscriptionTier
        if !isActive {
            tier = .free
        } else if activeSubscriptions.contains(where: { $0.contains("yearly") }) {
            tier = .proYearly
        } else if activeSubscriptions.contains(where: { $0.contains("monthly") }) {
            tier = .proMonthly
        } else {
            tier = .free
        }

        let status = SubscriptionStatus(
            tier: tier,
            isActive: isActive,
            willRenew: proEntitlement?.willRenew ?? false,
            expirationDate: proEntitlement?.expirationDate,
            productIdentifier: proEntitlement?.productIdentifier,
            originalTransactionId: customerInfo.originalAppUserId,
            hasProEntitlement: hasProEntitlement
        )

        print("[SubscriptionService] Updated subscription status: \(status)")

        subscriptionStatus = status
        cacheSubscriptionStatus(status)
    }

    private func cacheSubscriptionStatus(_ status: SubscriptionStatus) {
        do {
            let data = try JSONEncoder().encode(status)
            try keychainService.save(data: data, for: "subscription_status")
            print("[SubscriptionService] Subscription status cached")

        } catch {
            print("[SubscriptionService] Failed to cache subscription status: \(error)")
        }
    }

    @MainActor
    private func loadCachedSubscriptionStatus() {
        do {
            guard let data = keychainService.retrieveData(for: "subscription_status") else {
                print("[SubscriptionService] No cached subscription status found")
                return
            }

            let cachedStatus = try JSONDecoder().decode(SubscriptionStatus.self, from: data)
            subscriptionStatus = cachedStatus
            print("[SubscriptionService] Loaded cached subscription status: \(cachedStatus)")

        } catch {
            print("[SubscriptionService] Failed to load cached subscription status: \(error)")
        }
    }
}

// MARK: - PurchasesDelegate

@available(iOS 17.0, *)
extension SubscriptionService {

    public func purchases(_ purchases: Purchases, receivedUpdated customerInfo: CustomerInfo) {
        print("[SubscriptionService] Customer info updated via delegate")
        Task { @MainActor in
            await updateSubscriptionStatus(customerInfo)
        }
    }
}

// MARK: - SubscriptionStatus Codable

@available(iOS 17.0, *)
extension SubscriptionStatus: Codable {

    enum CodingKeys: String, CodingKey {
        case tier, isActive, willRenew, expirationDate
        case productIdentifier, originalTransactionId, hasProEntitlement
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        tier = try container.decode(SubscriptionTier.self, forKey: .tier)
        isActive = try container.decode(Bool.self, forKey: .isActive)
        willRenew = try container.decode(Bool.self, forKey: .willRenew)
        expirationDate = try container.decodeIfPresent(Date.self, forKey: .expirationDate)
        productIdentifier = try container.decodeIfPresent(String.self, forKey: .productIdentifier)
        originalTransactionId = try container.decodeIfPresent(String.self, forKey: .originalTransactionId)
        hasProEntitlement = try container.decode(Bool.self, forKey: .hasProEntitlement)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(tier, forKey: .tier)
        try container.encode(isActive, forKey: .isActive)
        try container.encode(willRenew, forKey: .willRenew)
        try container.encodeIfPresent(expirationDate, forKey: .expirationDate)
        try container.encodeIfPresent(productIdentifier, forKey: .productIdentifier)
        try container.encodeIfPresent(originalTransactionId, forKey: .originalTransactionId)
        try container.encode(hasProEntitlement, forKey: .hasProEntitlement)
    }
}

/// Purchase Manager - convenience wrapper for subscription operations
@available(iOS 17.0, *)
public final class PurchaseManager {

    public static let shared = PurchaseManager()

    private let subscriptionService: SubscriptionService

    private init() {
        self.subscriptionService = SubscriptionService()
    }

    public func configure(apiKey: String, userId: String? = nil) {
        subscriptionService.configure(apiKey: apiKey, userId: userId)
    }

    public var subscriptionStatus: SubscriptionStatus {
        subscriptionService.subscriptionStatus
    }

    public func purchaseProSubscription(yearly: Bool = false) async -> PurchaseResult {
        await subscriptionService.purchaseProSubscription(yearly: yearly)
    }

    public func restorePurchases() async -> PurchaseResult {
        await subscriptionService.restorePurchases()
    }

    public func checkProFeatureAccess(feature: String) -> Bool {
        subscriptionService.checkProFeatureAccess(feature: feature)
    }
}

/// Entitlement Checker - utility for checking subscription status
@available(iOS 17.0, *)
public final class EntitlementChecker {

    public static let shared = EntitlementChecker()

    private init() {}

    /// Check if user has access to Pro features
    public func hasProAccess() -> Bool {
        return PurchaseManager.shared.subscriptionStatus.hasProEntitlement
    }

    /// Check access to specific feature
    public func hasAccess(to feature: String) -> Bool {
        return PurchaseManager.shared.checkProFeatureAccess(feature: feature)
    }

    /// Get current subscription tier
    public func getCurrentTier() -> SubscriptionTier {
        return PurchaseManager.shared.subscriptionStatus.tier
    }
}
