
import { Hub } from '@/types';

export interface SudanState {
  id: string;
  name: string;
  code: string;
  localities: { id: string; name: string; nameAr?: string; }[];
}

/**
 * Complete list of Sudan's 18 states and 189 localities
 * Source: OCHA COD-AB (Common Operational Dataset - Administrative Boundaries)
 * Last Updated: August 2024
 * Reference: https://data.humdata.org/dataset/cod-ab-sdn
 */
export const sudanStates: SudanState[] = [
  // 1. Khartoum State - 7 localities
  { 
    id: 'khartoum', 
    name: 'Khartoum', 
    code: 'KH', 
    localities: [
      { id: 'kh-khartoum', name: 'Khartoum', nameAr: 'الخرطوم' },
      { id: 'kh-bahri', name: 'Bahri', nameAr: 'بحري' },
      { id: 'kh-omdurman', name: 'Um Durman', nameAr: 'أم درمان' },
      { id: 'kh-jebel-awlia', name: 'Jebel Awlia', nameAr: 'جبل أولياء' },
      { id: 'kh-karrari', name: 'Karrari', nameAr: 'كرري' },
      { id: 'kh-sharg-an-neel', name: 'Sharg An Neel', nameAr: 'شرق النيل' },
      { id: 'kh-um-bada', name: 'Um Bada', nameAr: 'أمبدة' },
    ]
  },
  
  // 2. Al Jazirah (Gezira) State - 8 localities
  { 
    id: 'gezira', 
    name: 'Aj Jazirah', 
    code: 'GZ', 
    localities: [
      { id: 'gz-medani-al-kubra', name: 'Medani Al Kubra', nameAr: 'مدني الكبري' },
      { id: 'gz-al-hasahisa', name: 'Al Hasahisa', nameAr: 'الحصاحيصا' },
      { id: 'gz-al-kamlin', name: 'Al Kamlin', nameAr: 'الكاملين' },
      { id: 'gz-al-manaqil', name: 'Al Manaqil', nameAr: 'المناقل' },
      { id: 'gz-al-qurashi', name: 'Al Qurashi', nameAr: 'القرشي' },
      { id: 'gz-janub-al-jazirah', name: 'Janub Al Jazirah', nameAr: 'جنوب الجزيرة' },
      { id: 'gz-sharg-al-jazirah', name: 'Sharg Al Jazirah', nameAr: 'شرق الجزيرة' },
      { id: 'gz-um-algura', name: 'Um Algura', nameAr: 'أم القري' },
    ]
  },

  // 3. Red Sea State - 10 localities
  { 
    id: 'red-sea', 
    name: 'Red Sea', 
    code: 'RS', 
    localities: [
      { id: 'rs-port-sudan', name: 'Port Sudan', nameAr: 'بورتسودان' },
      { id: 'rs-sawakin', name: 'Sawakin', nameAr: 'سواكن' },
      { id: 'rs-agig', name: 'Agig', nameAr: 'عقيق' },
      { id: 'rs-al-ganab', name: 'Al Ganab', nameAr: 'القنب' },
      { id: 'rs-dordieb', name: 'Dordieb', nameAr: 'درديب' },
      { id: 'rs-halaib', name: "Hala'ib", nameAr: 'حلايب' },
      { id: 'rs-haya', name: 'Haya', nameAr: 'هيا' },
      { id: 'rs-jubayt-elmaadin', name: "Jubayt Elma'aadin", nameAr: 'جبيت المعادن' },
      { id: 'rs-sinkat', name: 'Sinkat', nameAr: 'سنكات' },
      { id: 'rs-tawkar', name: 'Tawkar', nameAr: 'طوكر' },
    ]
  },

  // 4. Kassala State - 11 localities
  { 
    id: 'kassala', 
    name: 'Kassala', 
    code: 'KS', 
    localities: [
      { id: 'ks-madeinat-kassala', name: 'Madeinat Kassala', nameAr: 'مدينة كسلا' },
      { id: 'ks-halfa-aj-jadeedah', name: 'Halfa Aj Jadeedah', nameAr: 'حلفا الجديدة' },
      { id: 'ks-reifi-aroma', name: 'Reifi Aroma', nameAr: 'ريفى أروما' },
      { id: 'ks-reifi-gharb-kassala', name: 'Reifi Gharb Kassala', nameAr: 'ريفى غرب كسلا' },
      { id: 'ks-reifi-hamashkureib', name: 'Reifi Hamashkureib', nameAr: 'ريفى همش كوريب' },
      { id: 'ks-reifi-kassla', name: 'Reifi Kassla', nameAr: 'ريفى كسلا' },
      { id: 'ks-reifi-khashm-elgirba', name: 'Reifi Khashm Elgirba', nameAr: 'ريفى خشم القربة' },
      { id: 'ks-reifi-nahr-atbara', name: 'Reifi Nahr Atbara', nameAr: 'ريفى نهر عطبرة' },
      { id: 'ks-reifi-shamal-ad-delta', name: 'Reifi Shamal Ad Delta', nameAr: 'ريفى شمال الدلتا' },
      { id: 'ks-reifi-telkok', name: 'Reifi Telkok', nameAr: 'ريفى تلكوك' },
      { id: 'ks-reifi-wad-elhilaiw', name: 'Reifi Wad Elhilaiw', nameAr: 'ريفى ود الحليو' },
    ]
  },

  // 5. Gedaref (Al Qadarif) State - 12 localities
  { 
    id: 'gedaref', 
    name: 'Gedaref', 
    code: 'GD', 
    localities: [
      { id: 'gd-madeinat-al-gedaref', name: 'Madeinat Al Gedaref', nameAr: 'مدينة القضارف' },
      { id: 'gd-wasat-al-gedaref', name: 'Wasat Al Gedaref', nameAr: 'وسط القضارف' },
      { id: 'gd-al-butanah', name: 'Al Butanah', nameAr: 'البطانة' },
      { id: 'gd-al-fao', name: 'Al Fao', nameAr: 'الفاو' },
      { id: 'gd-al-fashaga', name: 'Al Fashaga', nameAr: 'الفشقة' },
      { id: 'gd-al-galabat-al-gharbyah', name: 'Al Galabat Al Gharbyah - Kassab', nameAr: 'القلابات الغربية - كساب' },
      { id: 'gd-al-mafaza', name: 'Al Mafaza', nameAr: 'المفازة' },
      { id: 'gd-al-qureisha', name: 'Al Qureisha', nameAr: 'القريشة' },
      { id: 'gd-ar-rahad', name: 'Ar Rahad', nameAr: 'الرهد' },
      { id: 'gd-basundah', name: 'Basundah', nameAr: 'باسندة' },
      { id: 'gd-galaa-al-nahal', name: "Gala'a Al Nahal", nameAr: 'قلع النحل' },
      { id: 'gd-galabat-ash-shargiah', name: 'Galabat Ash-Shargiah', nameAr: 'القلابات الشرقية' },
    ]
  },

  // 6. White Nile State - 9 localities
  { 
    id: 'white-nile', 
    name: 'White Nile', 
    code: 'WN', 
    localities: [
      { id: 'wn-rabak', name: 'Rabak', nameAr: 'ربك' },
      { id: 'wn-kosti', name: 'Kosti', nameAr: 'كوستي' },
      { id: 'wn-ad-diwaim', name: 'Ad Diwaim', nameAr: 'الدويم' },
      { id: 'wn-aj-jabalain', name: 'Aj Jabalain', nameAr: 'الجبلين' },
      { id: 'wn-al-gitaina', name: 'Al Gitaina', nameAr: 'القطينة' },
      { id: 'wn-as-salam-ar-rawat', name: 'As Salam / Ar Rawat', nameAr: 'السلام / الراوات' },
      { id: 'wn-guli', name: 'Guli', nameAr: 'قلي' },
      { id: 'wn-tendalti', name: 'Tendalti', nameAr: 'تندلتي' },
      { id: 'wn-um-rimta', name: 'Um Rimta', nameAr: 'أم رمتة' },
    ]
  },

  // 7. Blue Nile State - 7 localities
  { 
    id: 'blue-nile', 
    name: 'Blue Nile', 
    code: 'BN', 
    localities: [
      { id: 'bn-ed-damazine', name: 'Ed Damazine', nameAr: 'الدمازين' },
      { id: 'bn-ar-rusayris', name: 'Ar Rusayris', nameAr: 'الروصيرص' },
      { id: 'bn-al-kurmuk', name: 'Al Kurmuk', nameAr: 'الكرمك' },
      { id: 'bn-at-tadamon', name: 'At Tadamon - BN', nameAr: 'التضامن - ن ق' },
      { id: 'bn-baw', name: 'Baw', nameAr: 'باو' },
      { id: 'bn-geisan', name: 'Geisan', nameAr: 'قيسان' },
      { id: 'bn-wad-al-mahi', name: 'Wad Al Mahi', nameAr: 'ود الماحي' },
    ]
  },

  // 8. Sennar State - 7 localities
  { 
    id: 'sennar', 
    name: 'Sennar', 
    code: 'SN', 
    localities: [
      { id: 'sn-sinja', name: 'Sinja', nameAr: 'سنجة' },
      { id: 'sn-sennar', name: 'Sennar', nameAr: 'سنار' },
      { id: 'sn-abu-hujar', name: 'Abu Hujar', nameAr: 'أبو حجار' },
      { id: 'sn-ad-dali', name: 'Ad Dali', nameAr: 'الدالي' },
      { id: 'sn-ad-dinder', name: 'Ad Dinder', nameAr: 'الدندر' },
      { id: 'sn-as-suki', name: 'As Suki', nameAr: 'السوكي' },
      { id: 'sn-sharg-sennar', name: 'Sharg Sennar', nameAr: 'شرق سنار' },
    ]
  },

  // 9. North Kordofan State - 8 localities
  { 
    id: 'north-kordofan', 
    name: 'North Kordofan', 
    code: 'NK', 
    localities: [
      { id: 'nk-sheikan', name: 'Sheikan', nameAr: 'شيكان' },
      { id: 'nk-bara', name: 'Bara', nameAr: 'بارا' },
      { id: 'nk-ar-rahad', name: 'Ar Rahad', nameAr: 'الرهد' },
      { id: 'nk-gebrat-al-sheikh', name: 'Gebrat Al Sheikh', nameAr: 'جبرة الشيخ' },
      { id: 'nk-gharb-bara', name: 'Gharb Bara', nameAr: 'غرب بارا' },
      { id: 'nk-soudari', name: 'Soudari', nameAr: 'سودري' },
      { id: 'nk-um-dam-haj-ahmed', name: 'Um Dam Haj Ahmed', nameAr: 'أم دم حاج أحمد' },
      { id: 'nk-um-rawaba', name: 'Um Rawaba', nameAr: 'أم روابة' },
    ]
  },

  // 10. South Kordofan State - 17 localities
  { 
    id: 'south-kordofan', 
    name: 'South Kordofan', 
    code: 'SK', 
    localities: [
      { id: 'sk-kadugli', name: 'Kadugli', nameAr: 'كادقلي' },
      { id: 'sk-dilling', name: 'Dilling', nameAr: 'الدلنج' },
      { id: 'sk-abassiya', name: 'Abassiya', nameAr: 'العباسية' },
      { id: 'sk-abu-jubayhah', name: 'Abu Jubayhah', nameAr: 'أبو جبيهة' },
      { id: 'sk-abu-kershola', name: 'Abu Kershola', nameAr: 'أبو كرشولا' },
      { id: 'sk-al-buram', name: 'Al Buram', nameAr: 'البرام' },
      { id: 'sk-al-leri', name: 'Al Leri', nameAr: 'الليري' },
      { id: 'sk-al-quoz', name: 'Al Quoz', nameAr: 'القوز' },
      { id: 'sk-ar-rashad', name: 'Ar Rashad', nameAr: 'الرشاد' },
      { id: 'sk-ar-reif-ash-shargi', name: 'Ar Reif Ash Shargi', nameAr: 'الريف الشرقي' },
      { id: 'sk-at-tadamon', name: 'At Tadamon - SK', nameAr: 'التضامن - ج ك' },
      { id: 'sk-delami', name: 'Delami', nameAr: 'دلامي' },
      { id: 'sk-ghadeer', name: 'Ghadeer', nameAr: 'غدير' },
      { id: 'sk-habila', name: 'Habila - SK', nameAr: 'هبيلة - ج ك' },
      { id: 'sk-heiban', name: 'Heiban', nameAr: 'هيبان' },
      { id: 'sk-talawdi', name: 'Talawdi', nameAr: 'تلودي' },
      { id: 'sk-um-durein', name: 'Um Durein', nameAr: 'أم دورين' },
    ]
  },

  // 11. West Kordofan State - 14 localities
  { 
    id: 'west-kordofan', 
    name: 'West Kordofan', 
    code: 'WK', 
    localities: [
      { id: 'wk-an-nuhud', name: 'An Nuhud', nameAr: 'النهود' },
      { id: 'wk-babanusa', name: 'Babanusa', nameAr: 'بابنوسة' },
      { id: 'wk-abu-zabad', name: 'Abu Zabad', nameAr: 'أبو زبد' },
      { id: 'wk-abyei', name: 'Abyei', nameAr: 'أبيي' },
      { id: 'wk-al-dibab', name: 'Al Dibab', nameAr: 'الدبب' },
      { id: 'wk-al-idia', name: 'Al Idia', nameAr: 'الأضية' },
      { id: 'wk-al-khiwai', name: 'Al Khiwai', nameAr: 'الخوي' },
      { id: 'wk-al-lagowa', name: 'Al Lagowa', nameAr: 'لقاوة' },
      { id: 'wk-al-meiram', name: 'Al Meiram', nameAr: 'الميرم' },
      { id: 'wk-as-salam', name: 'As Salam - WK', nameAr: 'السلام - غ ك' },
      { id: 'wk-as-sunut', name: 'As Sunut', nameAr: 'السنوط' },
      { id: 'wk-ghubaish', name: 'Ghubaish', nameAr: 'غبيش' },
      { id: 'wk-keilak', name: 'Keilak', nameAr: 'كيلك' },
      { id: 'wk-wad-bandah', name: 'Wad Bandah', nameAr: 'ود بندة' },
    ]
  },

  // 12. North Darfur State - 17 localities
  { 
    id: 'north-darfur', 
    name: 'North Darfur', 
    code: 'ND', 
    localities: [
      { id: 'nd-al-fasher', name: 'Al Fasher', nameAr: 'الفاشر' },
      { id: 'nd-kutum', name: 'Kutum', nameAr: 'كتم' },
      { id: 'nd-al-koma', name: 'Al Koma', nameAr: 'الكومة' },
      { id: 'nd-al-lait', name: 'Al Lait', nameAr: 'اللعيت' },
      { id: 'nd-al-malha', name: 'Al Malha', nameAr: 'المالحة' },
      { id: 'nd-as-serief', name: 'As Serief', nameAr: 'السريف' },
      { id: 'nd-at-tawisha', name: 'At Tawisha', nameAr: 'الطويشة' },
      { id: 'nd-at-tina', name: 'At Tina', nameAr: 'الطينة' },
      { id: 'nd-dar-as-salam', name: 'Dar As Salam', nameAr: 'دار السلام' },
      { id: 'nd-kebkabiya', name: 'Kebkabiya', nameAr: 'كبكابية' },
      { id: 'nd-kelemando', name: 'Kelemando', nameAr: 'كلمندو' },
      { id: 'nd-kernoi', name: 'Kernoi', nameAr: 'كرنوي' },
      { id: 'nd-melit', name: 'Melit', nameAr: 'مليط' },
      { id: 'nd-saraf-omra', name: 'Saraf Omra', nameAr: 'سرف عمرة' },
      { id: 'nd-tawila', name: 'Tawila', nameAr: 'طويلة' },
      { id: 'nd-um-baru', name: 'Um Baru', nameAr: 'أم برو' },
      { id: 'nd-um-kadadah', name: 'Um Kadadah', nameAr: 'أم كدادة' },
    ]
  },

  // 13. South Darfur State - 21 localities
  { 
    id: 'south-darfur', 
    name: 'South Darfur', 
    code: 'SD', 
    localities: [
      { id: 'sd-nyala-shimal', name: 'Nyala Shimal', nameAr: 'نيالا شمال' },
      { id: 'sd-nyala-janoub', name: 'Nyala Janoub', nameAr: 'نيالا جنوب' },
      { id: 'sd-al-radoum', name: 'Al Radoum', nameAr: 'الردوم' },
      { id: 'sd-al-wihda', name: 'Al Wihda', nameAr: 'الوحدة' },
      { id: 'sd-as-salam', name: 'As Salam - SD', nameAr: 'السلام - ج د' },
      { id: 'sd-as-sunta', name: 'As Sunta', nameAr: 'السنطة' },
      { id: 'sd-beliel', name: 'Beliel', nameAr: 'بليل' },
      { id: 'sd-buram', name: 'Buram', nameAr: 'برام' },
      { id: 'sd-damso', name: 'Damso', nameAr: 'دمسو' },
      { id: 'sd-ed-al-fursan', name: 'Ed Al Fursan', nameAr: 'عد الفرسان' },
      { id: 'sd-gereida', name: 'Gereida', nameAr: 'قريضة' },
      { id: 'sd-kas', name: 'Kas', nameAr: 'كاس' },
      { id: 'sd-kateila', name: 'Kateila', nameAr: 'كتيلا' },
      { id: 'sd-kubum', name: 'Kubum', nameAr: 'كبم' },
      { id: 'sd-mershing', name: 'Mershing', nameAr: 'مرشنج' },
      { id: 'sd-nitega', name: 'Nitega', nameAr: 'نتيقة' },
      { id: 'sd-rehaid-albirdi', name: 'Rehaid Albirdi', nameAr: 'رهيد البردي' },
      { id: 'sd-sharg-aj-jabal', name: 'Sharg Aj Jabal', nameAr: 'شرق الجبل' },
      { id: 'sd-shattaya', name: 'Shattaya', nameAr: 'شطاية' },
      { id: 'sd-tulus', name: 'Tulus', nameAr: 'تلس' },
      { id: 'sd-um-dafoug', name: 'Um Dafoug', nameAr: 'أم دافوق' },
    ]
  },

  // 14. West Darfur State - 8 localities
  { 
    id: 'west-darfur', 
    name: 'West Darfur', 
    code: 'WD', 
    localities: [
      { id: 'wd-ag-geneina', name: 'Ag Geneina', nameAr: 'الجنينة' },
      { id: 'wd-beida', name: 'Beida', nameAr: 'بيضا' },
      { id: 'wd-foro-baranga', name: 'Foro Baranga', nameAr: 'فور برنقا' },
      { id: 'wd-habila', name: 'Habila - WD', nameAr: 'هبيلة - غ د' },
      { id: 'wd-jebel-moon', name: 'Jebel Moon', nameAr: 'جبل مون' },
      { id: 'wd-kereneik', name: 'Kereneik', nameAr: 'كرينك' },
      { id: 'wd-kulbus', name: 'Kulbus', nameAr: 'كلبس' },
      { id: 'wd-sirba', name: 'Sirba', nameAr: 'سربا' },
    ]
  },

  // 15. East Darfur State - 9 localities
  { 
    id: 'east-darfur', 
    name: 'East Darfur', 
    code: 'ED', 
    localities: [
      { id: 'ed-ad-duayn', name: "Ad Du'ayn", nameAr: 'الضعين' },
      { id: 'ed-abu-jabrah', name: 'Abu Jabrah', nameAr: 'أبو جابرة' },
      { id: 'ed-abu-karinka', name: 'Abu Karinka', nameAr: 'أبو كارنكا' },
      { id: 'ed-adila', name: 'Adila', nameAr: 'عديلة' },
      { id: 'ed-al-firdous', name: 'Al Firdous', nameAr: 'الفردوس' },
      { id: 'ed-assalaya', name: 'Assalaya', nameAr: 'عسلاية' },
      { id: 'ed-bahr-al-arab', name: 'Bahr Al Arab', nameAr: 'بحر العرب' },
      { id: 'ed-shia-ria', name: "Shia'ria", nameAr: 'شعيرية' },
      { id: 'ed-yassin', name: 'Yassin', nameAr: 'يس' },
    ]
  },

  // 16. Central Darfur State - 9 localities
  { 
    id: 'central-darfur', 
    name: 'Central Darfur', 
    code: 'CD', 
    localities: [
      { id: 'cd-zalingi', name: 'Zalingi', nameAr: 'زالنجى' },
      { id: 'cd-azum', name: 'Azum', nameAr: 'أزوم' },
      { id: 'cd-bendasi', name: 'Bendasi', nameAr: 'بندسي' },
      { id: 'cd-gharb-jabal-marrah', name: 'Gharb Jabal Marrah', nameAr: 'غرب جبل مرة' },
      { id: 'cd-mukjar', name: 'Mukjar', nameAr: 'مكجر' },
      { id: 'cd-shamal-jabal-marrah', name: 'Shamal Jabal Marrah', nameAr: 'شمال جبل مرة' },
      { id: 'cd-um-dukhun', name: 'Um Dukhun', nameAr: 'أم دخن' },
      { id: 'cd-wadi-salih', name: 'Wadi Salih', nameAr: 'وادي صالح' },
      { id: 'cd-wasat-jabal-marrah', name: 'Wasat Jabal Marrah', nameAr: 'وسط جبل مرة' },
    ]
  },

  // 17. River Nile State - 7 localities
  { 
    id: 'river-nile', 
    name: 'River Nile', 
    code: 'RN', 
    localities: [
      { id: 'rn-ad-damar', name: 'Ad Damar', nameAr: 'الدامر' },
      { id: 'rn-atbara', name: 'Atbara', nameAr: 'عطبرة' },
      { id: 'rn-abu-hamad', name: 'Abu Hamad', nameAr: 'أبو حمد' },
      { id: 'rn-al-buhaira', name: 'Al Buhaira', nameAr: 'البحيرة' },
      { id: 'rn-al-matama', name: 'Al Matama', nameAr: 'المتمة' },
      { id: 'rn-barbar', name: 'Barbar', nameAr: 'بربر' },
      { id: 'rn-shendi', name: 'Shendi', nameAr: 'شندي' },
    ]
  },

  // 18. Northern State - 7 localities
  { 
    id: 'northern', 
    name: 'Northern', 
    code: 'NO', 
    localities: [
      { id: 'no-dongola', name: 'Dongola', nameAr: 'دنقلا' },
      { id: 'no-halfa', name: 'Halfa', nameAr: 'حلفا' },
      { id: 'no-ad-dabbah', name: 'Ad Dabbah', nameAr: 'الدبة' },
      { id: 'no-al-burgaig', name: 'Al Burgaig', nameAr: 'البرقيق' },
      { id: 'no-al-golid', name: 'Al Golid', nameAr: 'القولد' },
      { id: 'no-delgo', name: 'Delgo', nameAr: 'دلقو' },
      { id: 'no-merwoe', name: 'Merwoe', nameAr: 'مروي' },
    ]
  },
];

// Abyei PCA Area (disputed area, separate from 18 states)
export const abyeiPCA = {
  id: 'abyei-pca',
  name: 'Abyei PCA area',
  nameAr: 'إدارية أبيي',
  localities: [
    { id: 'abyei-pca-area', name: 'Abyei PCA area', nameAr: 'إدارية أبيي' }
  ]
};

/**
 * WFP Hub structure for Sudan operations
 * Based on WFP operational areas
 */
export const hubs: Hub[] = [
  {
    id: 'kassala-hub',
    name: 'Kassala Hub',
    states: ['kassala', 'red-sea', 'gedaref'],
    coordinates: { latitude: 15.45, longitude: 36.4 }
  },
  {
    id: 'kosti-hub',
    name: 'Kosti Hub',
    states: ['white-nile', 'sennar', 'blue-nile'],
    coordinates: { latitude: 13.2, longitude: 32.5 }
  },
  {
    id: 'el-fasher-hub',
    name: 'El Fasher Hub',
    states: ['north-darfur', 'south-darfur', 'west-darfur', 'central-darfur', 'east-darfur'],
    coordinates: { latitude: 13.63, longitude: 25.35 }
  },
  {
    id: 'dongola-hub',
    name: 'Dongola Hub',
    states: ['northern', 'river-nile'],
    coordinates: { latitude: 19.16, longitude: 30.48 }
  },
  {
    id: 'country-office',
    name: 'Country Office (Khartoum)',
    states: ['khartoum', 'gezira', 'north-kordofan', 'south-kordofan', 'west-kordofan'],
    coordinates: { latitude: 15.5007, longitude: 32.5599 }
  }
];

/**
 * Get localities for a given state
 */
export const getLocalitiesByState = (stateId: string): { id: string; name: string; nameAr?: string; }[] => {
  const state = sudanStates.find(s => s.id === stateId);
  return state ? state.localities : [];
};

/**
 * Get state name by ID
 */
export const getStateName = (stateId: string): string => {
  const state = sudanStates.find(s => s.id === stateId);
  return state ? state.name : stateId;
};

/**
 * Get state code by ID
 */
export const getStateCode = (stateId: string): string => {
  const state = sudanStates.find(s => s.id === stateId);
  return state ? state.code : stateId.toUpperCase().substring(0, 2);
};

/**
 * Get locality name by ID and state ID
 */
export const getLocalityName = (stateId: string, localityId: string): string => {
  const state = sudanStates.find(s => s.id === stateId);
  if (!state) return localityId;
  
  const locality = state.localities.find(l => l.id === localityId);
  return locality ? locality.name : localityId;
};

/**
 * Get locality Arabic name by ID and state ID
 */
export const getLocalityNameAr = (stateId: string, localityId: string): string | undefined => {
  const state = sudanStates.find(s => s.id === stateId);
  if (!state) return undefined;
  
  const locality = state.localities.find(l => l.id === localityId);
  return locality?.nameAr;
};

/**
 * Get hub for a given state
 */
export const getHubForState = (stateId: string): string | undefined => {
  const hub = hubs.find(h => h.states.includes(stateId));
  return hub?.id;
};

/**
 * Get hub name for a given state
 */
export const getHubNameForState = (stateId: string): string | undefined => {
  const hub = hubs.find(h => h.states.includes(stateId));
  return hub?.name;
};

/**
 * Get all states in a hub
 */
export const getStatesInHub = (hubId: string): SudanState[] => {
  const hub = hubs.find(h => h.id === hubId);
  if (!hub) return [];
  return sudanStates.filter(s => hub.states.includes(s.id));
};

/**
 * Get total locality count
 */
export const getTotalLocalityCount = (): number => {
  return sudanStates.reduce((total, state) => total + state.localities.length, 0);
};

/**
 * Search localities by name (partial match)
 */
export const searchLocalities = (searchTerm: string): { state: SudanState; locality: { id: string; name: string; nameAr?: string; } }[] => {
  const results: { state: SudanState; locality: { id: string; name: string; nameAr?: string; } }[] = [];
  const term = searchTerm.toLowerCase();
  
  for (const state of sudanStates) {
    for (const locality of state.localities) {
      if (locality.name.toLowerCase().includes(term) || 
          (locality.nameAr && locality.nameAr.includes(searchTerm))) {
        results.push({ state, locality });
      }
    }
  }
  
  return results;
};
