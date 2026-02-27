// lib/constants/sudanese_banks.dart
// Ordered: Bank of Khartoum, Faisal, Omdurman first — then the rest alphabetically.

class SudaneseBank {
  final String nameEn;
  final String nameAr;
  final int accountDigits; // expected account number length

  const SudaneseBank({
    required this.nameEn,
    required this.nameAr,
    this.accountDigits = 7,
  });

  String get display => '$nameEn / $nameAr';
}

const List<SudaneseBank> kSudaneseBanks = [
  // ── Priority banks (top 3) ─────────────────────────────────────────────
  SudaneseBank(
    nameEn: 'Bank of Khartoum',
    nameAr: 'بنك الخرطوم',
    accountDigits: 7,
  ),
  SudaneseBank(
    nameEn: 'Faisal Islamic Bank of Sudan',
    nameAr: 'بنك فيصل الإسلامي السوداني',
  ),
  SudaneseBank(
    nameEn: 'Omdurman National Bank',
    nameAr: 'بنك أمدرمان الوطني',
  ),

  // ── Rest in alphabetical order ─────────────────────────────────────────
  SudaneseBank(
    nameEn: 'Agricultural Bank of Sudan',
    nameAr: 'بنك السودان الزراعي',
  ),
  SudaneseBank(
    nameEn: 'Al Baraka Bank Sudan',
    nameAr: 'مصرف البركة السودان',
  ),
  SudaneseBank(
    nameEn: 'Animal Resources Bank',
    nameAr: 'مصرف الثروة الحيوانية',
  ),
  SudaneseBank(
    nameEn: 'Blue Nile Mashreq Bank',
    nameAr: 'بنك النيل الأزرق المشرق',
  ),
  SudaneseBank(
    nameEn: 'El Nilein Bank',
    nameAr: 'بنك النيلين',
  ),
  SudaneseBank(
    nameEn: 'Emirates and Sudan Bank',
    nameAr: 'بنك الإمارات والسودان',
  ),
  SudaneseBank(
    nameEn: 'Family Bank',
    nameAr: 'بنك الأسرة',
  ),
  SudaneseBank(
    nameEn: 'Islamic Cooperative Development Bank',
    nameAr: 'مصرف التنمية التعاوني الإسلامي',
  ),
  SudaneseBank(
    nameEn: 'National Bank of Sudan',
    nameAr: 'البنك الوطني السوداني',
  ),
  SudaneseBank(
    nameEn: 'Saving and Social Development Bank',
    nameAr: 'بنك الادخار والتنمية الاجتماعية',
  ),
  SudaneseBank(
    nameEn: 'Saudi Sudanese Bank',
    nameAr: 'البنك السعودي السوداني',
  ),
  SudaneseBank(
    nameEn: 'Sudan Commercial Bank',
    nameAr: 'البنك التجاري السوداني',
  ),
  SudaneseBank(
    nameEn: 'Sudan Microfinance Institution',
    nameAr: 'مؤسسة التمويل الأصغر السودانية',
  ),
  SudaneseBank(
    nameEn: 'Sudanese Egyptian Bank',
    nameAr: 'البنك السوداني المصري',
  ),
  SudaneseBank(
    nameEn: 'Sudanese French Bank',
    nameAr: 'البنك السوداني الفرنسي',
  ),
  SudaneseBank(
    nameEn: 'Tadamon Islamic Bank',
    nameAr: 'مصرف التضامن الإسلامي',
  ),
  SudaneseBank(
    nameEn: 'United Capital Bank',
    nameAr: 'البنك المتحد',
  ),
  SudaneseBank(
    nameEn: 'Workers National Bank',
    nameAr: 'بنك العمال الوطني',
  ),
];

/// Returns the [SudaneseBank] for a given display name or null if not found.
SudaneseBank? bankByName(String name) {
  try {
    return kSudaneseBanks.firstWhere(
      (b) => b.nameEn == name || b.nameAr == name || b.display == name,
    );
  } catch (_) {
    return null;
  }
}
