import 'package:supabase_flutter/supabase_flutter.dart';

abstract class RpcClient {
  Future<dynamic> rpc(String fn, {Map<String, dynamic>? params});
}

class SupabaseRpcClient implements RpcClient {
  final SupabaseClient _client;

  SupabaseRpcClient(this._client);

  @override
  Future<dynamic> rpc(String fn, {Map<String, dynamic>? params}) {
    return _client.rpc(fn, params: params);
  }
}
