/// Wallet configuration constants matching the TSX implementation
const String DEFAULT_CURRENCY = 'SDG';
const String DEFAULT_LOCALE = 'en-SD';

/// Transaction type constants
const String TRANSACTION_TYPE_EARNING = 'earning';
const String TRANSACTION_TYPE_SITE_VISIT_FEE = 'site_visit_fee';
const String TRANSACTION_TYPE_WITHDRAWAL = 'withdrawal';
const String TRANSACTION_TYPE_BONUS = 'bonus';
const String TRANSACTION_TYPE_PENALTY = 'penalty';
const String TRANSACTION_TYPE_ADJUSTMENT = 'adjustment';

/// Withdrawal status constants (matching dashboard spec)
const String WITHDRAWAL_STATUS_PENDING = 'pending';
const String WITHDRAWAL_STATUS_SUPERVISOR_APPROVED = 'supervisor_approved';
const String WITHDRAWAL_STATUS_PROCESSING = 'processing';
const String WITHDRAWAL_STATUS_APPROVED = 'approved';
const String WITHDRAWAL_STATUS_REJECTED = 'rejected';
const String WITHDRAWAL_STATUS_CANCELLED = 'cancelled';
const String WITHDRAWAL_STATUS_PROCESSED = 'processed';

/// Date filter constants
const String DATE_FILTER_ALL = 'all';
const String DATE_FILTER_THIS_MONTH = 'this_month';
const String DATE_FILTER_LAST_MONTH = 'last_month';
const String DATE_FILTER_LAST_3_MONTHS = 'last_3_months';

/// Numeric constants
const int SITE_VISIT_EARNINGS_LIMIT = 10;
const int RECENT_TRANSACTIONS_LIMIT = 5;
const int EARNINGS_MONTHS_LIMIT = 6;
const double MINIMUM_WITHDRAWAL_AMOUNT = 0.01;

/// Time constants
const Duration WALLET_REFRESH_INTERVAL = Duration(seconds: 30);
const Duration TRANSACTION_FETCH_TIMEOUT = Duration(seconds: 10);
