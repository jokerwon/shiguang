// 收藏 Tab：Web 模式复刻 —— /recipes?limit=100 + /favorites 本地交集（发现 1）
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Recipe } from '@shiguang/domain';
import { fetchRecipes, fetchFavorites, toggleFavorite } from '../../lib/api';
import { fetchWithCache, CacheKeys, isNetworkOnline } from '../../lib/cache';
import { RecipeCard } from '../../components/recipe-card';

export default function FavoriteScreen() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const loadData = useCallback(async () => {
    try {
      // 全量拉菜谱（limit=100，与 Web 对齐）
      const [recipesRes, favResult] = await Promise.all([
        fetchWithCache<Recipe[]>({
          fetcher: async () => {
            const res = await fetchRecipes({ limit: 100 });
            return res.data;
          },
          cacheKey: CacheKeys.favoritesRecipes,
        }),
        fetchWithCache<string[]>({
          fetcher: fetchFavorites,
          cacheKey: CacheKeys.favoritesIds,
        }),
      ]);
      if (recipesRes.data) setRecipes(recipesRes.data);
      if (favResult.data) setSavedIds(new Set(favResult.data));
      // fetchWithCache 内部吞错写入 error 字段，需显式检查（离线无缓存时提示）
      const swrError = recipesRes.error ?? favResult.error;
      if (swrError && !recipesRes.data && !favResult.data) {
        Alert.alert('加载失败', swrError.message);
      }
    } catch (err) {
      Alert.alert('加载失败', (err as Error).message);
    } finally {
      setIsLoading(false);
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

  const onToggle = useCallback(
    async (recipeId: string) => {
      if (!isNetworkOnline()) {
        Alert.alert('离线', '离线时无法修改收藏');
        return;
      }
      try {
        const next = await toggleFavorite(recipeId);
        setSavedIds(new Set(next));
      } catch {
        Alert.alert('操作失败', '请检查网络');
      }
    },
    [],
  );

  // 本地交集：只展示收藏的菜谱
  const favoriteRecipes = recipes.filter((r) => savedIds.has(r.id));

  return (
    <View style={styles.container}>
      <FlatList
        data={favoriteRecipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/recipe/${item.id}`)}>
            <RecipeCard recipe={item} isSaved onToggleSave={() => onToggle(item.id)} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {isLoading ? '加载中...' : '还没有收藏'}
            </Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: '#999' },
});
