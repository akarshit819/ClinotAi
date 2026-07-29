export { stripeProvider } from "./stripe-provider"
export {
  type BillingProvider,
  type BillingPlan,
  type BillingCustomer,
  type BillingSubscription,
  type CheckoutSession,
  type BillingPortalSession,
  type InvoiceData,
  type UsageRecord,
  type PlanLimits,
} from "./provider"
export {
  getAllPlans,
  getPlanBySlug,
  getPlanById,
  getDefaultPlan,
  getPlanPrice,
  getPlanName,
  getStripePriceId,
  isUnlimited,
  type PlanData,
  type PlanFeatures,
  type PlanLimits as PlanLimitTypes,
} from "./plans"
export {
  getCurrentUsage,
  getUsageWithLimits,
  checkConversationLimit,
  incrementConversationCount,
  incrementTokenUsage,
  getMonthlyUsage,
  type UsageData,
  type UsageLimitResult,
} from "./usage"
export {
  getOrCreateStripeCustomer,
  createCheckoutSession,
  getSubscription,
  getBillingData,
  cancelSubscription,
  reactivateSubscription,
  changePlan,
  createPortalSession,
  syncSubscriptionFromStripe,
} from "./subscription"
export {
  getClinicSubscriptionStatus,
  checkFeatureAccess,
  checkUsageLimit,
  requireActiveSubscription,
  requireFeatureAccess,
  requireUsageLimit,
  type FeatureCheckResult,
  type SubscriptionStatus,
} from "./feature-check"
export {
  recordBillingHistory,
  getBillingHistory,
  type BillingHistoryEntry,
} from "./history"
export {
  processStripeWebhook,
} from "./webhooks"
export {
  sendBillingEmail,
  subscriptionStartedEmail,
  paymentSucceededEmail,
  paymentFailedEmail,
  subscriptionCancelledEmail,
  subscriptionReactivatedEmail,
  planChangedEmail,
  invoiceAvailableEmail,
} from "./emails"