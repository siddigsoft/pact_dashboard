import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/currency_conversion_service.dart';
import '../theme/app_colors.dart';

/// Multi-currency converter widget
class CurrencyConverterWidget extends StatefulWidget {
  final bool isArabic;
  final VoidCallback? onClose;

  const CurrencyConverterWidget({
    super.key,
    this.isArabic = false,
    this.onClose,
  });

  @override
  State<CurrencyConverterWidget> createState() =>
      _CurrencyConverterWidgetState();
}

class _CurrencyConverterWidgetState extends State<CurrencyConverterWidget> {
  late TextEditingController _amountController;
  String _fromCurrency = 'SDG';
  String _toCurrency = 'USD';
  double _convertedAmount = 0;
  final _currencies = ['SDG', 'USD', 'EUR', 'GBP', 'SAR', 'AED'];

  @override
  void initState() {
    super.initState();
    _amountController = TextEditingController();
  }

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  void _convert() {
    final amount = double.tryParse(_amountController.text) ?? 0;
    if (amount > 0) {
      setState(() {
        if (_fromCurrency == 'SDG') {
          final rate = CurrencyConversionService.getExchangeRate(
            _toCurrency.toUpperCase(),
          );
          _convertedAmount = amount * rate;
        } else if (_toCurrency == 'SDG') {
          final rate = CurrencyConversionService.getExchangeRate(
            _fromCurrency.toUpperCase(),
          );
          _convertedAmount = amount / rate;
        } else {
          // Convert from one currency to another via SDG
          final toSDGRate = CurrencyConversionService.getExchangeRate(
            _fromCurrency,
          );
          final amountInSDG = amount / toSDGRate;
          final fromSDGRate = CurrencyConversionService.getExchangeRate(
            _toCurrency,
          );
          _convertedAmount = amountInSDG * fromSDGRate;
        }
      });
    }
  }

  void _swap() {
    setState(() {
      final temp = _fromCurrency;
      _fromCurrency = _toCurrency;
      _toCurrency = temp;
      _convertedAmount = 0;
      _amountController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.1),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                widget.isArabic ? '💱 محول العملات' : '💱 Currency Converter',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (widget.onClose != null)
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: widget.onClose,
                  constraints: const BoxConstraints(),
                  padding: EdgeInsets.zero,
                ),
            ],
          ),
          const SizedBox(height: 16),
          // From Currency
          Text(
            widget.isArabic ? 'من' : 'From',
            style: GoogleFonts.poppins(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: AppColors.textLight,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade200),
              borderRadius: BorderRadius.circular(8),
            ),
            child: DropdownButton<String>(
              value: _fromCurrency,
              underline: const SizedBox(),
              isExpanded: true,
              onChanged: (value) {
                if (value != null) {
                  setState(() {
                    _fromCurrency = value;
                    _convertedAmount = 0;
                  });
                }
              },
              items: _currencies
                  .map(
                    (currency) => DropdownMenuItem(
                      value: currency,
                      child: Text(
                        currency,
                        style: GoogleFonts.poppins(fontSize: 13),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          const SizedBox(height: 12),
          // Amount Input
          TextField(
            controller: _amountController,
            onChanged: (_) => _convert(),
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              hintText: widget.isArabic ? 'أدخل المبلغ' : 'Enter amount',
              hintStyle: GoogleFonts.poppins(
                fontSize: 13,
                color: Colors.grey.shade400,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: Colors.grey.shade200),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: Colors.grey.shade200),
              ),
              contentPadding: const EdgeInsets.all(12),
            ),
          ),
          const SizedBox(height: 12),
          // Swap Button
          Center(
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.primaryBlue.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: IconButton(
                icon: const Icon(Icons.swap_vert),
                onPressed: _swap,
                color: AppColors.primaryBlue,
              ),
            ),
          ),
          const SizedBox(height: 12),
          // To Currency
          Text(
            widget.isArabic ? 'إلى' : 'To',
            style: GoogleFonts.poppins(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: AppColors.textLight,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade200),
              borderRadius: BorderRadius.circular(8),
            ),
            child: DropdownButton<String>(
              value: _toCurrency,
              underline: const SizedBox(),
              isExpanded: true,
              onChanged: (value) {
                if (value != null) {
                  setState(() {
                    _toCurrency = value;
                    _convertedAmount = 0;
                  });
                }
              },
              items: _currencies
                  .map(
                    (currency) => DropdownMenuItem(
                      value: currency,
                      child: Text(
                        currency,
                        style: GoogleFonts.poppins(fontSize: 13),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          const SizedBox(height: 12),
          // Result
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  widget.isArabic ? 'النتيجة' : 'Result',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: AppColors.textLight,
                  ),
                ),
                Text(
                  '${_convertedAmount.toStringAsFixed(2)} $_toCurrency',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primaryBlue,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
