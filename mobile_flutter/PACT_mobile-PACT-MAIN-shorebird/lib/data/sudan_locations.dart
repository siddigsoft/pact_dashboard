// lib/data/sudan_locations.dart

/// Complete list of Sudan's 18 states and 189 localities
/// Source: OCHA COD-AB (Common Operational Dataset - Administrative Boundaries)
/// Last Updated: August 2024
/// Reference: https://data.humdata.org/dataset/cod-ab-sdn
library;

class Locality {
  final String id;
  final String name;
  final String? nameAr;

  Locality({required this.id, required this.name, this.nameAr});
}

class SudanState {
  final String id;
  final String name;
  final String code;
  final List<Locality> localities;

  SudanState({
    required this.id,
    required this.name,
    required this.code,
    required this.localities,
  });
}

class Hub {
  final String id;
  final String name;
  final List<String> states;
  final Map<String, double> coordinates;

  Hub({
    required this.id,
    required this.name,
    required this.states,
    required this.coordinates,
  });
}

final List<SudanState> sudanStates = [
  // 1. Khartoum State - 7 localities
  SudanState(
    id: 'khartoum',
    name: 'Khartoum',
    code: 'KH',
    localities: [
      Locality(id: 'kh-khartoum', name: 'Khartoum', nameAr: 'الخرطوم'),
      Locality(id: 'kh-bahri', name: 'Bahri', nameAr: 'بحري'),
      Locality(id: 'kh-omdurman', name: 'Um Durman', nameAr: 'أم درمان'),
      Locality(id: 'kh-jebel-awlia', name: 'Jebel Awlia', nameAr: 'جبل أولياء'),
      Locality(id: 'kh-karrari', name: 'Karrari', nameAr: 'كرري'),
      Locality(
        id: 'kh-sharg-an-neel',
        name: 'Sharg An Neel',
        nameAr: 'شرق النيل',
      ),
      Locality(id: 'kh-um-bada', name: 'Um Bada', nameAr: 'أمبدة'),
    ],
  ),

  // 2. Al Jazirah (Gezira) State - 8 localities
  SudanState(
    id: 'gezira',
    name: 'Aj Jazirah',
    code: 'GZ',
    localities: [
      Locality(
        id: 'gz-medani-al-kubra',
        name: 'Medani Al Kubra',
        nameAr: 'مدني الكبري',
      ),
      Locality(id: 'gz-al-hasahisa', name: 'Al Hasahisa', nameAr: 'الحصاحيصا'),
      Locality(id: 'gz-al-kamlin', name: 'Al Kamlin', nameAr: 'الكاملين'),
      Locality(id: 'gz-al-manaqil', name: 'Al Manaqil', nameAr: 'المناقل'),
      Locality(id: 'gz-al-qurashi', name: 'Al Qurashi', nameAr: 'القرشي'),
      Locality(
        id: 'gz-janub-al-jazirah',
        name: 'Janub Al Jazirah',
        nameAr: 'جنوب الجزيرة',
      ),
      Locality(
        id: 'gz-sharg-al-jazirah',
        name: 'Sharg Al Jazirah',
        nameAr: 'شرق الجزيرة',
      ),
      Locality(id: 'gz-um-algura', name: 'Um Algura', nameAr: 'أم القري'),
    ],
  ),

  // 3. Red Sea State - 10 localities
  SudanState(
    id: 'red-sea',
    name: 'Red Sea',
    code: 'RS',
    localities: [
      Locality(id: 'rs-port-sudan', name: 'Port Sudan', nameAr: 'بورتسودان'),
      Locality(id: 'rs-sawakin', name: 'Sawakin', nameAr: 'سواكن'),
      Locality(id: 'rs-agig', name: 'Agig', nameAr: 'عقيق'),
      Locality(id: 'rs-al-ganab', name: 'Al Ganab', nameAr: 'القنب'),
      Locality(id: 'rs-dordieb', name: 'Dordieb', nameAr: 'درديب'),
      Locality(id: 'rs-halaib', name: "Hala'ib", nameAr: 'حلايب'),
      Locality(id: 'rs-haya', name: 'Haya', nameAr: 'هيا'),
      Locality(
        id: 'rs-jubayt-elmaadin',
        name: "Jubayt Elma'aadin",
        nameAr: 'جبيت المعادن',
      ),
      Locality(id: 'rs-sinkat', name: 'Sinkat', nameAr: 'سنكات'),
      Locality(id: 'rs-tawkar', name: 'Tawkar', nameAr: 'طوكر'),
    ],
  ),

  // 4. Kassala State - 11 localities
  SudanState(
    id: 'kassala',
    name: 'Kassala',
    code: 'KS',
    localities: [
      Locality(
        id: 'ks-madeinat-kassala',
        name: 'Madeinat Kassala',
        nameAr: 'مدينة كسلا',
      ),
      Locality(
        id: 'ks-halfa-aj-jadeedah',
        name: 'Halfa Aj Jadeedah',
        nameAr: 'حلفا الجديدة',
      ),
      Locality(id: 'ks-reifi-aroma', name: 'Reifi Aroma', nameAr: 'ريفى أروما'),
      Locality(
        id: 'ks-reifi-gharb-kassala',
        name: 'Reifi Gharb Kassala',
        nameAr: 'ريفى غرب كسلا',
      ),
      Locality(
        id: 'ks-reifi-hamashkureib',
        name: 'Reifi Hamashkureib',
        nameAr: 'ريفى همش كوريب',
      ),
      Locality(
        id: 'ks-reifi-kassla',
        name: 'Reifi Kassla',
        nameAr: 'ريفى كسلا',
      ),
      Locality(
        id: 'ks-reifi-khashm-elgirba',
        name: 'Reifi Khashm Elgirba',
        nameAr: 'ريفى خشم القربة',
      ),
      Locality(
        id: 'ks-reifi-nahr-atbara',
        name: 'Reifi Nahr Atbara',
        nameAr: 'ريفى نهر عطبرة',
      ),
      Locality(
        id: 'ks-reifi-shamal-ad-delta',
        name: 'Reifi Shamal Ad Delta',
        nameAr: 'ريفى شمال الدلتا',
      ),
      Locality(
        id: 'ks-reifi-telkok',
        name: 'Reifi Telkok',
        nameAr: 'ريفى تلكوك',
      ),
      Locality(
        id: 'ks-reifi-wad-elhilaiw',
        name: 'Reifi Wad Elhilaiw',
        nameAr: 'ريفى ود الحليو',
      ),
    ],
  ),

  // 5. Gedaref (Al Qadarif) State - 12 localities
  SudanState(
    id: 'gedaref',
    name: 'Gedaref',
    code: 'GD',
    localities: [
      Locality(
        id: 'gd-madeinat-al-gedaref',
        name: 'Madeinat Al Gedaref',
        nameAr: 'مدينة القضارف',
      ),
      Locality(
        id: 'gd-wasat-al-gedaref',
        name: 'Wasat Al Gedaref',
        nameAr: 'وسط القضارف',
      ),
      Locality(id: 'gd-al-butanah', name: 'Al Butanah', nameAr: 'البطانة'),
      Locality(id: 'gd-al-fao', name: 'Al Fao', nameAr: 'الفاو'),
      Locality(id: 'gd-al-fashaga', name: 'Al Fashaga', nameAr: 'الفشقة'),
      Locality(
        id: 'gd-al-galabat-al-gharbyah',
        name: 'Al Galabat Al Gharbyah - Kassab',
        nameAr: 'القلابات الغربية - كساب',
      ),
      Locality(id: 'gd-al-mafaza', name: 'Al Mafaza', nameAr: 'المفازة'),
      Locality(id: 'gd-al-qureisha', name: 'Al Qureisha', nameAr: 'القريشة'),
      Locality(id: 'gd-ar-rahad', name: 'Ar Rahad', nameAr: 'الرهد'),
      Locality(id: 'gd-basundah', name: 'Basundah', nameAr: 'باسندة'),
      Locality(
        id: 'gd-galaa-al-nahal',
        name: "Gala'a Al Nahal",
        nameAr: 'قلع النحل',
      ),
      Locality(
        id: 'gd-galabat-ash-shargiah',
        name: 'Galabat Ash-Shargiah',
        nameAr: 'القلابات الشرقية',
      ),
    ],
  ),

  // 6. White Nile State - 9 localities
  SudanState(
    id: 'white-nile',
    name: 'White Nile',
    code: 'WN',
    localities: [
      Locality(id: 'wn-rabak', name: 'Rabak', nameAr: 'ربك'),
      Locality(id: 'wn-kosti', name: 'Kosti', nameAr: 'كوستي'),
      Locality(id: 'wn-ad-diwaim', name: 'Ad Diwaim', nameAr: 'الدويم'),
      Locality(id: 'wn-aj-jabalain', name: 'Aj Jabalain', nameAr: 'الجبلين'),
      Locality(id: 'wn-al-gitaina', name: 'Al Gitaina', nameAr: 'القطينة'),
      Locality(
        id: 'wn-as-salam-ar-rawat',
        name: 'As Salam / Ar Rawat',
        nameAr: 'السلام / الراوات',
      ),
      Locality(id: 'wn-guli', name: 'Guli', nameAr: 'قلي'),
      Locality(id: 'wn-tendalti', name: 'Tendalti', nameAr: 'تندلتي'),
      Locality(id: 'wn-um-rimta', name: 'Um Rimta', nameAr: 'أم رمتة'),
    ],
  ),

  // 7. Blue Nile State - 7 localities
  SudanState(
    id: 'blue-nile',
    name: 'Blue Nile',
    code: 'BN',
    localities: [
      Locality(id: 'bn-ed-damazine', name: 'Ed Damazine', nameAr: 'الدمازين'),
      Locality(id: 'bn-ar-rusayris', name: 'Ar Rusayris', nameAr: 'الروصيرص'),
      Locality(id: 'bn-al-kurmuk', name: 'Al Kurmuk', nameAr: 'الكرمك'),
      Locality(
        id: 'bn-at-tadamon',
        name: 'At Tadamon - BN',
        nameAr: 'التضامن - ن ق',
      ),
      Locality(id: 'bn-baw', name: 'Baw', nameAr: 'باو'),
      Locality(id: 'bn-geisan', name: 'Geisan', nameAr: 'قيسان'),
      Locality(id: 'bn-wad-al-mahi', name: 'Wad Al Mahi', nameAr: 'ود الماحي'),
    ],
  ),

  // 8. Sennar State - 7 localities
  SudanState(
    id: 'sennar',
    name: 'Sennar',
    code: 'SN',
    localities: [
      Locality(id: 'sn-sinja', name: 'Sinja', nameAr: 'سنجة'),
      Locality(id: 'sn-sennar', name: 'Sennar', nameAr: 'سنار'),
      Locality(id: 'sn-abu-hujar', name: 'Abu Hujar', nameAr: 'أبو حجار'),
      Locality(id: 'sn-ad-dali', name: 'Ad Dali', nameAr: 'الدالي'),
      Locality(id: 'sn-ad-dinder', name: 'Ad Dinder', nameAr: 'الدندر'),
      Locality(id: 'sn-as-suki', name: 'As Suki', nameAr: 'السوكي'),
      Locality(id: 'sn-sharg-sennar', name: 'Sharg Sennar', nameAr: 'شرق سنار'),
    ],
  ),

  // 9. North Kordofan State - 8 localities
  SudanState(
    id: 'north-kordofan',
    name: 'North Kordofan',
    code: 'NK',
    localities: [
      Locality(id: 'nk-sheikan', name: 'Sheikan', nameAr: 'شيكان'),
      Locality(id: 'nk-bara', name: 'Bara', nameAr: 'بارا'),
      Locality(id: 'nk-ar-rahad', name: 'Ar Rahad', nameAr: 'الرهد'),
      Locality(
        id: 'nk-gebrat-al-sheikh',
        name: 'Gebrat Al Sheikh',
        nameAr: 'جبرة الشيخ',
      ),
      Locality(id: 'nk-gharb-bara', name: 'Gharb Bara', nameAr: 'غرب بارا'),
      Locality(id: 'nk-soudari', name: 'Soudari', nameAr: 'سودري'),
      Locality(
        id: 'nk-um-dam-haj-ahmed',
        name: 'Um Dam Haj Ahmed',
        nameAr: 'أم دم حاج أحمد',
      ),
      Locality(id: 'nk-um-rawaba', name: 'Um Rawaba', nameAr: 'أم روابة'),
    ],
  ),

  // 10. South Kordofan State - 17 localities
  SudanState(
    id: 'south-kordofan',
    name: 'South Kordofan',
    code: 'SK',
    localities: [
      Locality(id: 'sk-kadugli', name: 'Kadugli', nameAr: 'كادقلي'),
      Locality(id: 'sk-dilling', name: 'Dilling', nameAr: 'الدلنج'),
      Locality(id: 'sk-abassiya', name: 'Abassiya', nameAr: 'العباسية'),
      Locality(
        id: 'sk-abu-jubayhah',
        name: 'Abu Jubayhah',
        nameAr: 'أبو جبيهة',
      ),
      Locality(
        id: 'sk-abu-kershola',
        name: 'Abu Kershola',
        nameAr: 'أبو كرشولا',
      ),
      Locality(id: 'sk-al-buram', name: 'Al Buram', nameAr: 'البرام'),
      Locality(id: 'sk-al-leri', name: 'Al Leri', nameAr: 'الليري'),
      Locality(id: 'sk-al-quoz', name: 'Al Quoz', nameAr: 'القوز'),
      Locality(id: 'sk-ar-rashad', name: 'Ar Rashad', nameAr: 'الرشاد'),
      Locality(
        id: 'sk-ar-reif-ash-shargi',
        name: 'Ar Reif Ash Shargi',
        nameAr: 'الريف الشرقي',
      ),
      Locality(
        id: 'sk-at-tadamon',
        name: 'At Tadamon - SK',
        nameAr: 'التضامن - ج ك',
      ),
      Locality(id: 'sk-delami', name: 'Delami', nameAr: 'دلامي'),
      Locality(id: 'sk-ghadeer', name: 'Ghadeer', nameAr: 'غدير'),
      Locality(id: 'sk-habila', name: 'Habila - SK', nameAr: 'هبيلة - ج ك'),
      Locality(id: 'sk-heiban', name: 'Heiban', nameAr: 'هيبان'),
      Locality(id: 'sk-talawdi', name: 'Talawdi', nameAr: 'تلودي'),
      Locality(id: 'sk-um-durein', name: 'Um Durein', nameAr: 'أم دورين'),
    ],
  ),

  // 11. West Kordofan State - 14 localities
  SudanState(
    id: 'west-kordofan',
    name: 'West Kordofan',
    code: 'WK',
    localities: [
      Locality(id: 'wk-an-nuhud', name: 'An Nuhud', nameAr: 'النهود'),
      Locality(id: 'wk-babanusa', name: 'Babanusa', nameAr: 'بابنوسة'),
      Locality(id: 'wk-abu-zabad', name: 'Abu Zabad', nameAr: 'أبو زبد'),
      Locality(id: 'wk-abyei', name: 'Abyei', nameAr: 'أبيي'),
      Locality(id: 'wk-al-dibab', name: 'Al Dibab', nameAr: 'الدبب'),
      Locality(id: 'wk-al-idia', name: 'Al Idia', nameAr: 'الأضية'),
      Locality(id: 'wk-al-khiwai', name: 'Al Khiwai', nameAr: 'الخوي'),
      Locality(id: 'wk-al-lagowa', name: 'Al Lagowa', nameAr: 'لقاوة'),
      Locality(id: 'wk-al-meiram', name: 'Al Meiram', nameAr: 'الميرم'),
      Locality(
        id: 'wk-as-salam',
        name: 'As Salam - WK',
        nameAr: 'السلام - غ ك',
      ),
      Locality(id: 'wk-as-sunut', name: 'As Sunut', nameAr: 'السنوط'),
      Locality(id: 'wk-ghubaish', name: 'Ghubaish', nameAr: 'غبيش'),
      Locality(id: 'wk-keilak', name: 'Keilak', nameAr: 'كيلك'),
      Locality(id: 'wk-wad-bandah', name: 'Wad Bandah', nameAr: 'ود بندة'),
    ],
  ),

  // 12. North Darfur State - 17 localities
  SudanState(
    id: 'north-darfur',
    name: 'North Darfur',
    code: 'ND',
    localities: [
      Locality(id: 'nd-al-fasher', name: 'Al Fasher', nameAr: 'الفاشر'),
      Locality(id: 'nd-kutum', name: 'Kutum', nameAr: 'كتم'),
      Locality(id: 'nd-al-koma', name: 'Al Koma', nameAr: 'الكومة'),
      Locality(id: 'nd-al-lait', name: 'Al Lait', nameAr: 'اللعيت'),
      Locality(id: 'nd-al-malha', name: 'Al Malha', nameAr: 'المالحة'),
      Locality(id: 'nd-as-serief', name: 'As Serief', nameAr: 'السريف'),
      Locality(id: 'nd-at-tawisha', name: 'At Tawisha', nameAr: 'الطويشة'),
      Locality(id: 'nd-at-tina', name: 'At Tina', nameAr: 'الطينة'),
      Locality(
        id: 'nd-dar-as-salam',
        name: 'Dar As Salam',
        nameAr: 'دار السلام',
      ),
      Locality(id: 'nd-kebkabiya', name: 'Kebkabiya', nameAr: 'كبكابية'),
      Locality(id: 'nd-kelemando', name: 'Kelemando', nameAr: 'كلمندو'),
      Locality(id: 'nd-kernoi', name: 'Kernoi', nameAr: 'كرنوي'),
      Locality(id: 'nd-melit', name: 'Melit', nameAr: 'مليط'),
      Locality(id: 'nd-saraf-omra', name: 'Saraf Omra', nameAr: 'سرف عمرة'),
      Locality(id: 'nd-tawila', name: 'Tawila', nameAr: 'طويلة'),
      Locality(id: 'nd-um-baru', name: 'Um Baru', nameAr: 'أم برو'),
      Locality(id: 'nd-um-kadadah', name: 'Um Kadadah', nameAr: 'أم كدادة'),
    ],
  ),

  // 13. South Darfur State - 21 localities
  SudanState(
    id: 'south-darfur',
    name: 'South Darfur',
    code: 'SD',
    localities: [
      Locality(
        id: 'sd-nyala-shimal',
        name: 'Nyala Shimal',
        nameAr: 'نيالا شمال',
      ),
      Locality(
        id: 'sd-nyala-janoub',
        name: 'Nyala Janoub',
        nameAr: 'نيالا جنوب',
      ),
      Locality(id: 'sd-al-radoum', name: 'Al Radoum', nameAr: 'الردوم'),
      Locality(id: 'sd-al-wihda', name: 'Al Wihda', nameAr: 'الوحدة'),
      Locality(
        id: 'sd-as-salam',
        name: 'As Salam - SD',
        nameAr: 'السلام - ج د',
      ),
      Locality(id: 'sd-as-sunta', name: 'As Sunta', nameAr: 'السنطة'),
      Locality(id: 'sd-beliel', name: 'Beliel', nameAr: 'بليل'),
      Locality(id: 'sd-buram', name: 'Buram', nameAr: 'برام'),
      Locality(id: 'sd-damso', name: 'Damso', nameAr: 'دمسو'),
      Locality(
        id: 'sd-ed-al-fursan',
        name: 'Ed Al Fursan',
        nameAr: 'عد الفرسان',
      ),
      Locality(id: 'sd-gereida', name: 'Gereida', nameAr: 'قريضة'),
      Locality(id: 'sd-kas', name: 'Kas', nameAr: 'كاس'),
      Locality(id: 'sd-kateila', name: 'Kateila', nameAr: 'كتيلا'),
      Locality(id: 'sd-kubum', name: 'Kubum', nameAr: 'كبم'),
      Locality(id: 'sd-mershing', name: 'Mershing', nameAr: 'مرشنج'),
      Locality(id: 'sd-nitega', name: 'Nitega', nameAr: 'نتيقة'),
      Locality(
        id: 'sd-rehaid-albirdi',
        name: 'Rehaid Albirdi',
        nameAr: 'رهيد البردي',
      ),
      Locality(
        id: 'sd-sharg-aj-jabal',
        name: 'Sharg Aj Jabal',
        nameAr: 'شرق الجبل',
      ),
      Locality(id: 'sd-shattaya', name: 'Shattaya', nameAr: 'شطاية'),
      Locality(id: 'sd-tulus', name: 'Tulus', nameAr: 'تلس'),
      Locality(id: 'sd-um-dafoug', name: 'Um Dafoug', nameAr: 'أم دافوق'),
    ],
  ),

  // 14. West Darfur State - 8 localities
  SudanState(
    id: 'west-darfur',
    name: 'West Darfur',
    code: 'WD',
    localities: [
      Locality(id: 'wd-ag-geneina', name: 'Ag Geneina', nameAr: 'الجنينة'),
      Locality(id: 'wd-beida', name: 'Beida', nameAr: 'بيضا'),
      Locality(
        id: 'wd-foro-baranga',
        name: 'Foro Baranga',
        nameAr: 'فور برنقا',
      ),
      Locality(id: 'wd-habila', name: 'Habila - WD', nameAr: 'هبيلة - غ د'),
      Locality(id: 'wd-jebel-moon', name: 'Jebel Moon', nameAr: 'جبل مون'),
      Locality(id: 'wd-kereneik', name: 'Kereneik', nameAr: 'كرينك'),
      Locality(id: 'wd-kulbus', name: 'Kulbus', nameAr: 'كلبس'),
      Locality(id: 'wd-sirba', name: 'Sirba', nameAr: 'سربا'),
    ],
  ),

  // 15. East Darfur State - 9 localities
  SudanState(
    id: 'east-darfur',
    name: 'East Darfur',
    code: 'ED',
    localities: [
      Locality(id: 'ed-ad-duayn', name: "Ad Du'ayn", nameAr: 'الضعين'),
      Locality(id: 'ed-abu-jabrah', name: 'Abu Jabrah', nameAr: 'أبو جابرة'),
      Locality(id: 'ed-abu-karinka', name: 'Abu Karinka', nameAr: 'أبو كارنكا'),
      Locality(id: 'ed-adila', name: 'Adila', nameAr: 'عديلة'),
      Locality(id: 'ed-al-firdous', name: 'Al Firdous', nameAr: 'الفردوس'),
      Locality(id: 'ed-assalaya', name: 'Assalaya', nameAr: 'عسلاية'),
      Locality(
        id: 'ed-bahr-al-arab',
        name: 'Bahr Al Arab',
        nameAr: 'بحر العرب',
      ),
      Locality(id: 'ed-shia-ria', name: "Shia'ria", nameAr: 'شعيرية'),
      Locality(id: 'ed-yassin', name: 'Yassin', nameAr: 'يس'),
    ],
  ),

  // 16. Central Darfur State - 9 localities
  SudanState(
    id: 'central-darfur',
    name: 'Central Darfur',
    code: 'CD',
    localities: [
      Locality(id: 'cd-zalingi', name: 'Zalingi', nameAr: 'زالنجى'),
      Locality(id: 'cd-azum', name: 'Azum', nameAr: 'أزوم'),
      Locality(id: 'cd-bendasi', name: 'Bendasi', nameAr: 'بندسي'),
      Locality(
        id: 'cd-gharb-jabal-marrah',
        name: 'Gharb Jabal Marrah',
        nameAr: 'غرب جبل مرة',
      ),
      Locality(id: 'cd-mukjar', name: 'Mukjar', nameAr: 'مكجر'),
      Locality(
        id: 'cd-shamal-jabal-marrah',
        name: 'Shamal Jabal Marrah',
        nameAr: 'شمال جبل مرة',
      ),
      Locality(id: 'cd-um-dukhun', name: 'Um Dukhun', nameAr: 'أم دخن'),
      Locality(id: 'cd-wadi-salih', name: 'Wadi Salih', nameAr: 'وادي صالح'),
      Locality(
        id: 'cd-wasat-jabal-marrah',
        name: 'Wasat Jabal Marrah',
        nameAr: 'وسط جبل مرة',
      ),
    ],
  ),

  // 17. River Nile State - 7 localities
  SudanState(
    id: 'river-nile',
    name: 'River Nile',
    code: 'RN',
    localities: [
      Locality(id: 'rn-ad-damar', name: 'Al Damar', nameAr: 'الدامر'),
      Locality(id: 'rn-atbara', name: 'Atbara', nameAr: 'عطبرة'),
      Locality(id: 'rn-abu-hamad', name: 'Abu Hamad', nameAr: 'أبو حمد'),
      Locality(id: 'rn-al-buhaira', name: 'Al Buhaira', nameAr: 'البحيرة'),
      Locality(id: 'rn-al-matama', name: 'Al Matama', nameAr: 'المتمة'),
      Locality(id: 'rn-barbar', name: 'Barbar', nameAr: 'بربر'),
      Locality(id: 'rn-shandi', name: 'Shandi', nameAr: 'شندي'),
    ],
  ),

  // 18. Northern State - 8 localities
  SudanState(
    id: 'northern',
    name: 'Northern',
    code: 'NO',
    localities: [
      Locality(id: 'no-dongola', name: 'Dongola', nameAr: 'دنقلا'),
      Locality(id: 'no-halfa', name: 'Halfa', nameAr: 'حلفا'),
      Locality(id: 'no-ad-dabbah', name: 'Ad Dabbah', nameAr: 'الدبة'),
      Locality(id: 'no-al-burgaig', name: 'Al Burgaig', nameAr: 'البرقيق'),
      Locality(id: 'no-al-borgag', name: 'Al Borgag', nameAr: 'البرقيق'),
      Locality(id: 'no-al-golid', name: 'Al Golid', nameAr: 'القولد'),
      Locality(id: 'no-delgo', name: 'Delgo', nameAr: 'دلقو'),
      Locality(id: 'no-merwoe', name: 'Merwoe', nameAr: 'مروي'),
    ],
  ),
];

/// WFP Hub structure for Sudan operations
/// Based on WFP operational areas - Updated to match UI configuration
final List<Hub> hubs = [
  Hub(
    id: 'country-office',
    name: 'Country Office (Khartoum)',
    states: ['khartoum', 'red-sea'],
    coordinates: {'latitude': 15.5007, 'longitude': 32.5599},
  ),
  Hub(
    id: 'dongola-hub',
    name: 'Dongola Hub',
    states: ['northern', 'river-nile'],
    coordinates: {'latitude': 19.16, 'longitude': 30.48},
  ),
  Hub(
    id: 'forchana-hub',
    name: 'Forchana Hub',
    states: ['west-darfur', 'central-darfur'],
    coordinates: {'latitude': 13.63, 'longitude': 25.35},
  ),
  Hub(
    id: 'kassala-hub',
    name: 'Kassala Hub',
    states: ['kassala', 'gedaref', 'gezira', 'sennar', 'blue-nile'],
    coordinates: {'latitude': 15.45, 'longitude': 36.4},
  ),
  Hub(
    id: 'kosti-hub',
    name: 'Kosti Hub',
    states: [
      'white-nile',
      'north-kordofan',
      'south-kordofan',
      'west-kordofan',
      'north-darfur',
      'south-darfur',
      'east-darfur',
    ],
    coordinates: {'latitude': 13.2, 'longitude': 32.5},
  ),
];

/// Get localities for a given state
List<Locality> getLocalitiesByState(String stateId) {
  final state = sudanStates.firstWhere(
    (s) => s.id == stateId,
    orElse: () => sudanStates.first,
  );
  return state.localities;
}

/// Get state name by ID
String getStateName(String stateId) {
  final state = sudanStates.firstWhere(
    (s) => s.id == stateId,
    orElse: () => sudanStates.first,
  );
  return state.name;
}

/// Get state code by ID
String getStateCode(String stateId) {
  final state = sudanStates.firstWhere(
    (s) => s.id == stateId,
    orElse: () => sudanStates.first,
  );
  return state.code;
}

/// Get locality name by ID and state ID
String getLocalityName(String stateId, String localityId) {
  final state = sudanStates.firstWhere(
    (s) => s.id == stateId,
    orElse: () => sudanStates.first,
  );
  final locality = state.localities.firstWhere(
    (l) => l.id == localityId,
    orElse: () => state.localities.first,
  );
  return locality.name;
}

/// Get locality Arabic name by ID and state ID
String? getLocalityNameAr(String stateId, String localityId) {
  final state = sudanStates.firstWhere(
    (s) => s.id == stateId,
    orElse: () => sudanStates.first,
  );
  final locality = state.localities.firstWhere(
    (l) => l.id == localityId,
    orElse: () => state.localities.first,
  );
  return locality.nameAr;
}

/// Get hub for a given state
String? getHubForState(String stateId) {
  final hub = hubs.firstWhere(
    (h) => h.states.contains(stateId),
    orElse: () => hubs.first,
  );
  return hub.id;
}

/// Get hub name for a given state
String? getHubNameForState(String stateId) {
  final hub = hubs.firstWhere(
    (h) => h.states.contains(stateId),
    orElse: () => hubs.first,
  );
  return hub.name;
}

/// Get all states in a hub
List<SudanState> getStatesInHub(String hubId) {
  final hub = hubs.firstWhere((h) => h.id == hubId, orElse: () => hubs.first);
  return sudanStates.where((s) => hub.states.contains(s.id)).toList();
}

/// Get total locality count
int getTotalLocalityCount() {
  return sudanStates.fold(0, (total, state) => total + state.localities.length);
}

/// Search localities by name (partial match)
List<Map<String, dynamic>> searchLocalities(String searchTerm) {
  final results = <Map<String, dynamic>>[];
  final term = searchTerm.toLowerCase();

  for (final state in sudanStates) {
    for (final locality in state.localities) {
      if (locality.name.toLowerCase().contains(term) ||
          (locality.nameAr != null && locality.nameAr!.contains(searchTerm))) {
        results.add({'state': state, 'locality': locality});
      }
    }
  }

  return results;
}
