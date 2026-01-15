import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio_smart_retry/dio_smart_retry.dart';
import 'logger_service.dart';

class NetworkSecurityService {
  static final NetworkSecurityService _instance = NetworkSecurityService._internal();
  late Dio _dio;
  final Duration _timeout = const Duration(seconds: 30);

  factory NetworkSecurityService() {
    return _instance;
  }

  NetworkSecurityService._internal() {
    _initializeDio();
  }

  void _initializeDio() {
    _dio = Dio(BaseOptions(
      connectTimeout: _timeout,
      receiveTimeout: _timeout,
      sendTimeout: _timeout,
    ));

    // Add retry interceptor
    _dio.interceptors.add(RetryInterceptor(
      dio: _dio,
      logPrint: (message) => LoggerService.log(message),
      retries: 3,
      retryDelays: const [
        Duration(seconds: 1),
        Duration(seconds: 2),
        Duration(seconds: 3),
      ],
    ));

    // Add logging interceptor
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        LoggerService.log('🌐 Request: ${options.method} ${options.uri}');
        return handler.next(options);
      },
      onResponse: (response, handler) {
        LoggerService.log('✅ Response: ${response.statusCode}');
        return handler.next(response);
      },
      onError: (error, handler) {
        LoggerService.log(
          '❌ Error: ${error.message}',
          level: LogLevel.error,
        );
        return handler.next(error);
      },
    ));
  }

  Future<Response<T>> request<T>(
    String url, {
    String method = 'GET',
    Map<String, dynamic>? data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _dio.request<T>(
        url,
        data: data,
        queryParameters: queryParameters,
        options: options ?? Options(method: method),
        cancelToken: cancelToken,
      );
      return response;
    } catch (e) {
      LoggerService.log('Network request failed: $e', level: LogLevel.error);
      rethrow;
    }
  }

  void setBaseUrl(String baseUrl) {
    _dio.options.baseUrl = baseUrl;
  }

  void setCertificateVerification({bool verify = true}) {
    _dio.options.validateStatus = (status) {
      return status != null && status >= 200 && status < 400;
    };
    if (!verify) {
      LoggerService.log(
        'Certificate verification disabled - NOT RECOMMENDED FOR PRODUCTION',
        level: LogLevel.warning,
      );
      HttpOverrides.global = null;
    }
  }
}