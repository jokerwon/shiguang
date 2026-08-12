// 发现 Tab：personalized 推荐 + 菜系探索
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Recipe } from '@shiguang/domain';
import { CUISINES, CUISINE_LABELS } from '@shiguang/domain';
import { fetchPersonalized, fetchRecipes, type RecommendedResponse } from '../../lib/api';
import { fetchWithCache, CacheKeys } from '../../lib/cache';
import { RecipeCard } from '../../components/recipe-card';

export default function DiscoveryScreen() {
  const [rec, setRec] = useState<RecommendedResponse | null>(null);
  const [cuisineRecipes, setCuisineRecipes] = useState<Recipe[]>([]);
  const [activeCuisine, setActiveCuisine] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const loadData = useCallback(async () => {
    setError(null);
    const result = await fetchWithCache<RecommendedResponse>({
      fetcher: fetchPersonalized,
      cacheKey: CacheKeys.personalized,
    });
    if (result.data) {
      setRec(result.data);
    } else if (result.error) {
      // 无缓存且网络失败 → 显式提示，下拉可重试
      setError(result.error.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const onSelectCuisine = useCallback(async (cuisine: string) => {
    setActiveCuisine(cuisine);
    try {
      const res = await fetchRecipes({ cuisine, limit: 10 });
      setCuisineRecipes(res.data);
    } catch {
      setCuisineRecipes([]);
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* 加载失败提示（下拉可重试） */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* 今日推荐 */}
      {rec?.today && rec.today.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>今日推荐</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={rec.today}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => router.push(`/recipe/${item.id}`)}>
                <RecipeCard recipe={item} compact />
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* 快手菜 */}
      {rec?.quick && rec.quick.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>快手菜（≤15分钟）</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={rec.quick}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => router.push(`/recipe/${item.id}`)}>
                <RecipeCard recipe={item} compact />
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* 菜系探索 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>菜系探索</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {CUISINES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, activeCuisine === c && styles.chipActive]}
              onPress={() => onSelectCuisine(c)}
            >
              <Text style={[styles.chipText, activeCuisine === c && styles.chipTextActive]}>
                {CUISINE_LABELS[c]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {activeCuisine && (
          <FlatList
            data={cuisineRecipes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => router.push(`/recipe/${item.id}`)}>
                <RecipeCard recipe={item} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>暂无菜谱</Text>}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  section: { marginTop: 16, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  chipRow: { flexDirection: 'row', marginBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  chipActive: { backgroundColor: '#e85d04' },
  chipText: { fontSize: 14, color: '#333' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#999', paddingVertical: 20 },
  errorContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fdecea',
  },
  errorText: { color: '#b3261e', fontSize: 14 },
});
