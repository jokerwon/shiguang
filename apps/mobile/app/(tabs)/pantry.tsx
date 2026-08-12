// 食材 Tab：pantry 展示 + 添加 + 匹配反馈
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { SUGGEST_INGS, resolveIng, matchRecipes, type Recipe } from '@shiguang/domain';
import { fetchPantry, replacePantry, fetchRecipes } from '../../lib/api';
import { isNetworkOnline } from '../../lib/cache';

export default function PantryScreen() {
  const [pantry, setPantry] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [matched, setMatched] = useState<{ r: Recipe; score: number; have: string[] }[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [p, res] = await Promise.all([fetchPantry(), fetchRecipes({ limit: 100 })]);
      setPantry(p);
      setRecipes(res.data);
      if (p.length > 0) {
        setMatched(matchRecipes(res.data, p));
      }
    } catch (err) {
      Alert.alert('加载失败', (err as Error).message);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const addIngredient = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      const resolved = resolveIng(text);
      if (pantry.includes(resolved)) {
        setInput('');
        return;
      }
      const next = [...pantry, resolved];
      setPantry(next);
      setInput('');
      // 本地即时反馈
      if (recipes.length > 0) {
        setMatched(matchRecipes(recipes, next));
      }
      // 在线时持久化
      if (isNetworkOnline()) {
        try {
          await replacePantry(next);
        } catch {
          // 持久化失败：回滚乐观更新并提示，避免本地与服务端不一致
          setPantry(pantry);
          if (recipes.length > 0) {
            setMatched(matchRecipes(recipes, pantry));
          }
          Alert.alert('保存失败', '网络异常，食材未同步');
        }
      }
    },
    [pantry, recipes],
  );

  const removeIngredient = useCallback(
    async (name: string) => {
      const next = pantry.filter((p) => p !== name);
      setPantry(next);
      if (recipes.length > 0) {
        setMatched(matchRecipes(recipes, next));
      }
      if (isNetworkOnline()) {
        try {
          await replacePantry(next);
        } catch {
          // 持久化失败：回滚乐观更新并提示，避免本地与服务端不一致
          setPantry(pantry);
          if (recipes.length > 0) {
            setMatched(matchRecipes(recipes, pantry));
          }
          Alert.alert('保存失败', '网络异常，食材未同步');
        }
      }
    },
    [pantry, recipes],
  );

  const addFromSuggest = useCallback(
    (name: string) => {
      addIngredient(name);
    },
    [addIngredient],
  );

  return (
    <View style={styles.container}>
      {/* 输入区 */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="添加食材（如：西红柿）"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => addIngredient(input)}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => addIngredient(input)}
        >
          <Text style={styles.addBtnText}>添加</Text>
        </TouchableOpacity>
      </View>

      {/* 建议食材点选 */}
      <View style={styles.suggestRow}>
        <Text style={styles.suggestLabel}>常见食材：</Text>
        <View style={styles.suggestChips}>
          {SUGGEST_INGS.filter((s) => !pantry.includes(s)).map((s) => (
            <TouchableOpacity
              key={s}
              style={styles.suggestChip}
              onPress={() => addFromSuggest(s)}
            >
              <Text style={styles.suggestChipText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 已有食材 */}
      <Text style={styles.sectionTitle}>我的食材 ({pantry.length})</Text>
      <FlatList
        data={pantry}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.pantryChip}
            onPress={() => removeIngredient(item)}
          >
            <Text style={styles.pantryChipText}>{item} ✕</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>还没有食材，点击上方添加</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />

      {/* 匹配结果 */}
      {matched.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>可做的菜</Text>
          <FlatList
            data={matched}
            style={styles.matchList}
            keyExtractor={(item) => item.r.id}
            renderItem={({ item }) => (
              <View style={styles.matchCard}>
                <Text style={styles.matchName}>{item.r.name}</Text>
                <Text style={styles.matchScore}>匹配度 {item.score}%</Text>
                <Text style={styles.matchHave}>
                  已有：{item.have.join('、')}
                </Text>
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa', paddingHorizontal: 16, paddingTop: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  addBtn: {
    marginLeft: 8,
    backgroundColor: '#e85d04',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
  suggestRow: { marginBottom: 12 },
  suggestLabel: { fontSize: 12, color: '#999', marginBottom: 4 },
  suggestChips: { flexDirection: 'row', flexWrap: 'wrap' },
  suggestChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#e8f4e8',
    marginRight: 6,
    marginBottom: 4,
  },
  suggestChipText: { fontSize: 13, color: '#2d6a4f' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  pantryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fff3e0',
    marginRight: 8,
  },
  pantryChipText: { fontSize: 14, color: '#e65100' },
  empty: { color: '#999', paddingVertical: 12 },
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  matchList: { flex: 1 },
  matchName: { fontSize: 16, fontWeight: '600' },
  matchScore: { fontSize: 14, color: '#e85d04', marginTop: 2 },
  matchHave: { fontSize: 12, color: '#999', marginTop: 2 },
});
