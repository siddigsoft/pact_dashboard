VERSION_NAME = 1.01.0
BUILD_NUMBER := $(shell git rev-list --count HEAD 2>/dev/null || echo 1)
FULL_VERSION  = $(VERSION_NAME)+$(BUILD_NUMBER)

.PHONY: version android ios bundle shorebird clean help

help:
	@echo ""
	@echo "  PACT Mobile — PACT v$(VERSION_NAME) (build $(BUILD_NUMBER))"
	@echo ""
	@echo "  make version    — Stamp pubspec.yaml with auto build number"
	@echo "  make android    — Build release APK"
	@echo "  make bundle     — Build release App Bundle (Play Store)"
	@echo "  make ios        — Build release IPA"
	@echo "  make shorebird  — Shorebird release (OTA patch)"
	@echo "  make clean      — Clean build artifacts"
	@echo ""

version:
	@sed -i.bak 's/^version: .*/version: $(FULL_VERSION)/' pubspec.yaml && rm -f pubspec.yaml.bak
	@echo "[OK] Stamped pubspec.yaml → version: $(FULL_VERSION)"

android: version
	@echo "→ Building Android APK  [PACT v$(FULL_VERSION)]..."
	flutter build apk --release

bundle: version
	@echo "→ Building App Bundle  [PACT v$(FULL_VERSION)]..."
	flutter build appbundle --release

ios: version
	@echo "→ Building iOS IPA  [PACT v$(FULL_VERSION)]..."
	flutter build ipa --release

shorebird: version
	@echo "→ Shorebird patch release  [PACT v$(FULL_VERSION)]..."
	shorebird patch android

clean:
	flutter clean
	@echo "[OK] Build artifacts removed"
