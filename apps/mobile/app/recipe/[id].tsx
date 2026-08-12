// 菜谱详情页 + 缺料清单（ADR-0007）
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { Recipe, Ingredient } from '@shiguang/domain';
import {
  CUISINE_LABELS,
  PREF_LABELS,
  missingIngredients,
  matchScore,
} from '@shiguang/domain';
import { fetchRecipeById, fetchPantry, toggleFavorite, fetchFavorites } from '../../lib/api';
import { fetchWithCache, CacheKeys, isNetworkOnline } from '../../lib/cache';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [pantry, setPantry] = useState<string[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [missing, setMissing] = useState<Ingredient[]>([]);
  const [checkedMissing, setCheckedMissing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pantryLoaded, setPantryLoaded] = useState(false);

  // 加载菜谱详情（带缓存）
  useEffect(() => {
    if (!id) return;
    fetchWithCache<Recipe>({
      fetcher: () => fetchRecipeById(id),
      cacheKey: CacheKeys.recipe(id),
    }).then((result) => {
      if (result.data) setRecipe(result.data);
      setLoading(false);
    });
  }, [id]);

  // 加载 pantry + 收藏状态（仅在线）
  useEffect(() => {
    Promise.all([
      fetchPantry().catch(() => [] as string[]),
      fetchFavorites().catch(() => [] as string[]),
    ]).then(([p, favs]) => {
      setPantry(p);
      setPantryLoaded(true);
      if (id) setIsSaved(favs.includes(id));
    });
  }, [id]);

  // 计算缺料清单
  useEffect(() => {
    if (recipe && pantryLoaded) {
      setMissing(missingIngredients(recipe, pantry));
    }
  }, [recipe, pantry, pantryLoaded]);

  const onToggleFavorite = useCallback(async () => {
    if (!id || !isNetworkOnline()) {
      Alert.alert('离线', '离线时无法修改收藏');
      return;
    }
    try {
      const next = await toggleFavorite(id);
      setIsSaved(next.includes(id));
    } catch {
      Alert.alert('操作失败');
    }
  }, [id]);

  const toggleCheckedMissing = useCallback((name: string) => {
    setCheckedMissing((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>菜谱不存在</Text>
      </View>
    );
  }

  const { score, have } = matchScore(recipe, pantry);

  return (
    <ScrollView style={styles.container}>
      {/* 头图 */}
      {recipe.img ? (
        <View style={styles.imgPlaceholder}>
          <Text style={styles.imgText}>🍽️</Text>
        </View>
      ) : null}

      {/* 基本信息 */}
      <View style={styles.infoSection}>
        <Text style={styles.name}>{recipe.name}</Text>
        <Text style={styles.desc}>{recipe.desc}</Text>

        <View style={styles.tagRow}>
          <Text style={styles.tag}>{CUISINE_LABELS[recipe.cuisine] ?? recipe.cuisine}</Text>
          <Text style={styles.tag}>{recipe.time}分钟</Text>
          <Text style={styles.tag}>{recipe.kcal}kcal</Text>
          {recipe.tags.map((t) => (
            <Text key={t} style={styles.tag}>
              {PREF_LABELS[t] ?? t}
            </Text>
          ))}
        </View>

        {/* 匹配度 */}
        {pantryLoaded && pantry.length > 0 && (
          <View style={styles.matchSection}>
            <Text style={styles.matchText}>
              食材匹配度：{score}%（已有 {have.length}/{recipe.ingredients.length}）
            </Text>
          </View>
        )}
      </View>

      {/* 营养 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>营养信息</Text>
        <View style={styles.nutritionRow}>
          <View style={styles.nutritionItem}>
            <Text style={styles.nutritionValue}>{recipe.protein}g</Text>
            <Text style={styles.nutritionLabel}>蛋白质</Text>
          </View>
          <View style={styles.nutritionItem}>
            <Text style={styles.nutritionValue}>{recipe.carb}g</Text>
            <Text style={styles.nutritionLabel}>碳水</Text>
          </View>
          <View style={styles.nutritionItem}>
            <Text style={styles.nutritionValue}>{recipe.fat}g</Text>
            <Text style={styles.nutritionLabel}>脂肪</Text>
          </View>
        </View>
      </View>

      {/* 食材清单 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>食材</Text>
        {recipe.ingredients.map((ing, i) => {
          const has = have.includes(ing.name);
          return (
            <View key={i} style={styles.ingRow}>
              <Text style={[styles.ingName, has && styles.ingHave]}>
                {has ? '✅' : '⬜'} {ing.name}
              </Text>
              <Text style={styles.ingAmount}>{ing.amount}</Text>
            </View>
          );
        })}
      </View>

      {/* 缺料清单 */}
      {pantryLoaded && missing.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>缺料清单（购物清单）</Text>
          {missing.map((ing, i) => (
            <TouchableOpacity
              key={i}
              style={styles.missingRow}
              onPress={() => toggleCheckedMissing(ing.name)}
            >
              <Text
                style={[
                  styles.missingName,
                  checkedMissing.has(ing.name) && styles.missingChecked,
                ]}
              >
                {checkedMissing.has(ing.name) ? '✅' : '🛒'} {ing.name}
              </Text>
              <Text style={styles.missingAmount}>{ing.amount}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 离线缺料降级提示 */}
      {!pantryLoaded && (
        <View style={styles.offlineHint}>
          <Text style={styles.offlineHintText}>
            联网后可查看缺料清单
          </Text>
        </View>
      )}

      {/* 步骤 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>做法步骤</Text>
        {recipe.steps.map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <Text style={styles.stepNum}>{i + 1}</Text>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {/* 收藏按钮 */}
      <TouchableOpacity
        style={[styles.favBtn, isSaved && styles.favBtnSaved]}
        onPress={onToggleFavorite}
      >
        <Text style={[styles.favBtnText, isSaved && styles.favBtnTextSaved]}>
          {isSaved ? '❤️ 已收藏' : '🤍 收藏'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#e53935' },
  imgPlaceholder: {
    height: 200,
    backgroundColor: '#f5f0e8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imgText: { fontSize: 64 },
  infoSection: { padding: 16 },
  name: { fontSize: 24, fontWeight: '800' },
  desc: { fontSize: 14, color: '#666', marginTop: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  tag: {
    fontSize: 12,
    color: '#e85d04',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 6,
    marginBottom: 4,
  },
  matchSection: { marginTop: 8 },
  matchText: { fontSize: 14, color: '#2e7d32', fontWeight: '500' },
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-around' },
  nutritionItem: { alignItems: 'center' },
  nutritionValue: { fontSize: 18, fontWeight: '700', color: '#333' },
  nutritionLabel: { fontSize: 12, color: '#999', marginTop: 2 },
  ingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  ingName: { fontSize: 15, color: '#333' },
  ingHave: { color: '#2e7d32' },
  ingAmount: { fontSize: 14, color: '#999' },
  missingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  missingName: { fontSize: 15, color: '#e65100' },
  missingChecked: { color: '#999', textDecorationLine: 'line-through' },
  missingAmount: { fontSize: 14, color: '#999' },
  offlineHint: {
    margin: 16,
    padding: 12,
    backgroundColor: '#fff8e1',
    borderRadius: 8,
    alignItems: 'center',
  },
  offlineHintText: { fontSize: 13, color: '#f57f17' },
  stepRow: { flexDirection: 'row', marginBottom: 12 },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e85d04',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
    fontSize: 14,
    fontWeight: '700',
    marginRight: 12,
    overflow: 'hidden',
  },
  stepText: { flex: 1, fontSize: 15, lineHeight: 24, color: '#333' },
  favBtn: {
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    borderWidth: 1,
    borderColor: '#e85d04',
  },
  favBtnSaved: { backgroundColor: '#e85d04' },
  favBtnText: { fontSize: 16, fontWeight: '600', color: '#e85d04' },
  favBtnTextSaved: { color: '#fff' },
});
