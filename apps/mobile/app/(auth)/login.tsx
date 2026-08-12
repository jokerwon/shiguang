// 登录/注册页
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../_layout';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('提示', '请填写邮箱和密码');
      return;
    }
    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password, displayName || undefined);
      } else {
        await login(email, password);
      }
    } catch (err) {
      Alert.alert(isRegister ? '注册失败' : '登录失败', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [email, password, displayName, isRegister, login, register]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>食光</Text>
        <Text style={styles.subtitle}>
          {isRegister ? '创建新账号' : '欢迎回来'}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="邮箱"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        {isRegister && (
          <TextInput
            style={styles.input}
            placeholder="昵称（可选）"
            value={displayName}
            onChangeText={setDisplayName}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="密码"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={isRegister ? 'password-new' : 'password'}
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={onSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>
              {isRegister ? '注册' : '登录'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchBtn}
          onPress={() => setIsRegister(!isRegister)}
        >
          <Text style={styles.switchText}>
            {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  title: { fontSize: 36, fontWeight: '800', textAlign: 'center', color: '#e85d04' },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: '#e85d04',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  switchBtn: { marginTop: 20, alignItems: 'center' },
  switchText: { color: '#e85d04', fontSize: 14 },
});
