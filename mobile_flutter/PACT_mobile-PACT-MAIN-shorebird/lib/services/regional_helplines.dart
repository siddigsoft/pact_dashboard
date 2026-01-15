import 'package:url_launcher/url_launcher.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';

class RegionalHelplines {
  static List<Map<String, String>> contacts = [
    {
      'name': 'Mawada Mohammed',
      'position': 'Field Operations Assistant',
      'state': 'Northern',
      'phoneNumber': '0111178348-0965430569',
      'email': 'Mawdamohammed51@gmail.com',
    },
    {
      'name': 'Remaa Ishag',
      'position': 'Field Operations Assistant',
      'state': 'Red Sea',
      'phoneNumber': '909108781',
      'email': 'Reema.ishag.014@gmail.com',
    },
    {
      'name': 'Yaseen Salaheldain Shashug',
      'position': 'Field Supervisor - Kosti Hub',
      'state': 'Kosti Hup',
      'phoneNumber': '913663836',
      'email': 'Yaseen@pactorg.com',
    },
    {
      'name': 'Ahmed Abbas',
      'position': 'Field Supervisor - Dongola Hub',
      'state': 'Dongala Hup',
      'phoneNumber': '915888006',
      'email': 'ahmed.abass@pactorg.com',
    },
    {
      'name': 'Nureldeen Bushara',
      'position': 'Field Supervisor - Forchana Hub',
      'state': 'Forchana Hup',
      'phoneNumber': '912499554',
      'email': '',
    },
    {
      'name': 'Adam A. Elgabar',
      'position': 'Coordinator',
      'state': 'Central Darfur',
      'phoneNumber': '113983597',
      'email': 'adam.abdelgabar@pactorg.com',
    },
    {
      'name': 'Yaseen Adam Jedoo',
      'position': 'Coordinator',
      'state': 'South Darfur',
      'phoneNumber': '919599250',
      'email': '',
    },
    {
      'name': 'Salha Badawi',
      'position': 'Coordinator',
      'state': 'North Darfur',
      'phoneNumber': '910016867',
      'email': 'salha.badawi@pactorg.com',
    },
    {
      'name': 'Ensaf Adam Ibrahim',
      'position': 'Coordinator',
      'state': 'West Darfur',
      'phoneNumber': '910336028',
      'email': 'insaf.aldoom@pactorg.com',
    },
    {
      'name': 'Musab Daldum',
      'position': 'Coordinator',
      'state': 'East Darfur',
      'phoneNumber': '',
      'email': '',
    },
    {
      'name': 'Nashat Musa Kwa',
      'position': 'Coordinator',
      'state': 'South Kordofan',
      'phoneNumber': '125131662',
      'email': '',
    },
    {
      'name': 'Rahmatalla Mohamed',
      'position': 'Coordinator',
      'state': 'West Kordofan',
      'phoneNumber': '123377485',
      'email': 'Rahmtalla.mohamed@pactorg.com',
    },
    {
      'name': 'Amani Osman',
      'position': 'Coordinator',
      'state': 'North Kordofan',
      'phoneNumber': '911260991',
      'email': 'amani.osman@pactorg.com',
    },
    {
      'name': 'Ali Mohamed Ali',
      'position': 'Coordinator',
      'state': 'Red Sea',
      'phoneNumber': '921526747',
      'email': 'ali.m255355@gmail.com',
    },
    {
      'name': 'Madina Khalfallah',
      'position': 'Coordinator',
      'state': 'Blue Nile',
      'phoneNumber': '915363895',
      'email': 'medina.kalafalla@pactorg.com',
    },
    {
      'name': 'Mustafa Ajab',
      'position': 'Coordinator',
      'state': 'Kassala',
      'phoneNumber': '912988940',
      'email': 'mustafa.abubaker@pactorg.com',
    },
    {
      'name': 'Mohamed Mahmud',
      'position': 'Coordinator',
      'state': 'Gadarif',
      'phoneNumber': '122135213',
      'email': 'mohamed.mahamoud@pactorg.com',
    },
    {
      'name': 'Hagir Mustaffa',
      'position': 'Coordinator',
      'state': 'Sinar',
      'phoneNumber': '912656053',
      'email': 'hajirmostafa80@gmail.com',
    },
    {
      'name': 'Ahmed Hussein',
      'position': 'Coordinator',
      'state': 'Elgezira',
      'phoneNumber': '914040423',
      'email': '',
    },
    {
      'name': 'Awad Elfadil',
      'position': 'Coordinator',
      'state': 'River Nile',
      'phoneNumber': '249916000000',
      'email': 'awad.alfadil@pactorg.com',
    },
    {
      'name': 'Asma Mohamed',
      'position': 'Coordinator',
      'state': 'WhiteNile',
      'phoneNumber': '918270097',
      'email': 'asma.mohamed@pactorg.com',
    },
    {
      'name': 'Mohamed Abedelaziz Ali',
      'position': 'Coordinator',
      'state': 'Khartoum',
      'phoneNumber': '912111397',
      'email': '',
    },
    {
      'name': 'JelalEldeen Ahmed',
      'position': 'Coordinator',
      'state': 'Northern',
      'phoneNumber': '905320120',
      'email': 'jalal.ahmed@pactorg.com',
    },
  ];

  /// Get a list of contacts for a specific state
  static List<Map<String, String>> getContactsByState(String state) {
    return contacts.where((contact) => contact['state'] == state).toList();
  }

  /// Get a list of all states
  static List<String> getAllStates() {
    return contacts.map((contact) => contact['state']!).toSet().toList();
  }

  /// Get a list of all field supervisors
  static List<Map<String, String>> getFieldSupervisors() {
    return contacts
        .where((contact) => contact['position']!.contains('Field Supervisor'))
        .toList();
  }

  /// Get a list of all coordinators
  static List<Map<String, String>> getCoordinators() {
    return contacts
        .where((contact) => contact['position'] == 'Coordinator')
        .toList();
  }

  /// Get a list of all field operations assistants
  static List<Map<String, String>> getFieldOperationsAssistants() {
    return contacts
        .where((contact) => contact['position'] == 'Field Operations Assistant')
        .toList();
  }

  /// Search contacts by name
  static List<Map<String, String>> searchByName(String query) {
    final lowercaseQuery = query.toLowerCase();
    return contacts
        .where((contact) =>
            contact['name']!.toLowerCase().contains(lowercaseQuery))
        .toList();
  }

  /// Make a phone call
  static Future<void> makeCall(String phoneNumber) async {
    final url = Uri.parse('tel:$phoneNumber');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    }
  }

  /// Send an email
  static Future<void> sendEmail(String email) async {
    final url = Uri.parse('mailto:$email');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    }
  }

  /// Save contacts to local storage
  static Future<void> saveContacts() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('contacts', jsonEncode(contacts));
  }

  /// Load contacts from local storage
  static Future<void> loadContacts() async {
    final prefs = await SharedPreferences.getInstance();
    final savedContacts = prefs.getString('contacts');
    if (savedContacts != null) {
      final List<dynamic> decoded = jsonDecode(savedContacts);
      contacts = decoded.map((e) => Map<String, String>.from(e)).toList();
    }
  }

  /// Update a contact
  static Future<void> updateContact(Map<String, String> updatedContact) async {
    final index = contacts.indexWhere(
        (contact) => contact['phoneNumber'] == updatedContact['phoneNumber']);
    if (index != -1) {
      contacts[index] = updatedContact;
      await saveContacts();
    }
  }
}