// 我的 Tab：偏好档案 + 登出
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../_layout';
import {
  fetchPreferences,
  updatePreferences,
  type PreferenceResponse,
  type HealthGoal,
} from '../../lib/api';

const HEALTH_GOAL_LABELS: Record<HealthGoal, string> = {
  BALANCED: '均衡饮食',
  FAT_LOSS: '减脂',
  MUSCLE_GAIN: '增肌',
};

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [prefs, setPrefs] = useState<PreferenceResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [dislikedInput, setDislikedInput] = useState('');
  const [allergenInput, setAllergenInput] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPreferences()
      .then((p) => {
        setPrefs(p);
        setDislikedInput(p.dislikedIngredients.join(', '));
        setAllergenInput(p.allergens.join(', '));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const onSave = useCallback(async () => {
    if (!prefs) return;
    try {
      const updated = await updatePreferences({
        dislikedIngredients: dislikedInput
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
        allergens: allergenInput
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
        healthGoal: prefs.healthGoal,
      });
      setPrefs(updated);
      setEditing(false);
    } catch (err) {
      Alert.alert('保存失败', (err as Error).message);
    }
  }, [prefs, dislikedInput, allergenInput]);

  const onCycleGoal = useCallback(() => {
    if (!prefs) return;
    const goals: HealthGoal[] = ['BALANCED', 'FAT_LOSS', 'MUSCLE_GAIN'];
    const idx = goals.indexOf(prefs.healthGoal);
    const next = goals[(idx + 1) % goals.length];
    setPrefs({ ...prefs, healthGoal: next });
  }, [prefs]);

  const onLogout = useCallback(async () => {
    Alert.alert('确认登出', '登出后需要重新登录', [
      { text: '取消', style: 'cancel' },
      { text: '登出', style: 'destructive', onPress: () => logout() },
    ]);
  }, [logout]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* 用户信息 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>个人信息</Text>
        <Text style={styles.label}>
          {user?.displayName || user?.email || '未知用户'}
        </Text>
        {user?.email && user?.displayName && (
          <Text style={styles.sub}>{user.email}</Text>
        )}
      </View>

      {/* 偏好 */}
      {prefs && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>健康偏好</Text>

          <Text style={styles.label}>健康目标</Text>
          <TouchableOpacity
            style={styles.goalChip}
            onPress={editing ? onCycleGoal : undefined}
          >
            <Text style={styles.goalChipText}>
              {HEALTH_GOAL_LABELS[prefs.healthGoal]}
              {editing ? ' (点击切换)' : ''}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.label, { marginTop: 12 }]}>忌口食材</Text>
          {editing ? (
            <TextInput
              style={styles.input}
              value={dislikedInput}
              onChangeText={setDislikedInput}
              placeholder="逗号分隔，如：香菜, 芹菜"
            />
          ) : (
            <Text style={styles.value}>
              {prefs.dislikedIngredients.length > 0
                ? prefs.dislikedIngredients.join('、')
                : '无'}
            </Text>
          )}

          <Text style={[styles.label, { marginTop: 12 }]}>过敏原</Text>
          {editing ? (
            <TextInput
              style={styles.input}
              value={allergenInput}
              onChangeText={setAllergenInput}
              placeholder="逗号分隔，如：花生, 虾"
            />
          ) : (
            <Text style={styles.value}>
              {prefs.allergens.length > 0 ? prefs.allergens.join('、') : '无'}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.btn, editing ? styles.saveBtn : styles.editBtn]}
            onPress={editing ? onSave : () => setEditing(true)}
          >
            <Text style={[styles.btnText, editing && styles.saveBtnText]}>
              {editing ? '保存' : '编辑'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 登出 */}
      <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
        <Text style={styles.logoutText}>退出登录</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  label: { fontSize: 14, color: '#666', marginBottom: 4 },
  sub: { fontSize: 13, color: '#999' },
  value: { fontSize: 15, color: '#333' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  goalChip: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  goalChipText: { fontSize: 14, color: '#2e7d32', fontWeight: '500' },
  btn: {
    marginTop: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  editBtn: { backgroundColor: '#f0f0f0' },
  saveBtn: { backgroundColor: '#e85d04' },
  btnText: { fontSize: 15, fontWeight: '600', color: '#333' },
  saveBtnText: { color: '#fff' },
  logoutBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ffcccc',
  },
  logoutText: { fontSize: 15, color: '#e53935', fontWeight: '600' },
});
