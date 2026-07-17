/// User availability status enum
enum UserAvailability {
  online,
  offline,
  busy;

  String get label {
    switch (this) {
      case UserAvailability.online:
        return 'Online';
      case UserAvailability.offline:
        return 'Offline';
      case UserAvailability.busy:
        return 'Busy';
    }
  }

  String get value => name;

  static UserAvailability fromString(String? value) {
    switch (value?.toLowerCase()) {
      case 'online':
        return UserAvailability.online;
      case 'busy':
        return UserAvailability.busy;
      case 'offline':
      default:
        return UserAvailability.offline;
    }
  }
}
