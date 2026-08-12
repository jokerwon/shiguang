// 菜谱卡片组件（移动端）
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Recipe } from '@shiguang/domain';
import { CUISINE_LABELS, PREF_LABELS } from '@shiguang/domain';

interface RecipeCardProps {
  recipe: Recipe;
  compact?: boolean;
  isSaved?: boolean;
  onToggleSave?: () => void;
}

export function RecipeCard({ recipe, compact, isSaved, onToggleSave }: RecipeCardProps) {
  if (compact) {
    return (
      <View style={styles.compactCard}>
        <View style={styles.compactImg}>
          <Text style={styles.compactEmoji}>🍽️</Text>
        </View>
        <Text style={styles.compactName} numberOfLines={1}>
          {recipe.name}
        </Text>
        <Text style={styles.compactMeta}>
          {recipe.time}min · {recipe.kcal}kcal
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{recipe.name}</Text>
          <Text style={styles.cardDesc} numberOfLines={2}>
            {recipe.desc}
          </Text>
        </View>
        {onToggleSave && (
          <TouchableOpacity onPress={onToggleSave} style={styles.favBtn}>
            <Text style={styles.favIcon}>{isSaved ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tagRow}>
        <Text style={styles.tag}>
          {CUISINE_LABELS[recipe.cuisine] ?? recipe.cuisine}
        </Text>
        <Text style={styles.tag}>{recipe.time}分钟</Text>
        <Text style={styles.tag}>{recipe.kcal}kcal</Text>
        {recipe.tags.slice(0, 2).map((t) => (
          <Text key={t} style={styles.tag}>
            {PREF_LABELS[t] ?? t}
          </Text>
        ))}
      </View>

      <View style={styles.nutritionRow}>
        <Text style={styles.nutrition}>蛋白质 {recipe.protein}g</Text>
        <Text style={styles.nutrition}>碳水 {recipe.carb}g</Text>
        <Text style={styles.nutrition}>脂肪 {recipe.fat}g</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  cardName: { fontSize: 17, fontWeight: '700' },
  cardDesc: { fontSize: 13, color: '#888', marginTop: 2 },
  favBtn: { padding: 4 },
  favIcon: { fontSize: 20 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  tag: {
    fontSize: 11,
    color: '#e85d04',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 4,
    marginBottom: 2,
  },
  nutritionRow: { flexDirection: 'row', marginTop: 8 },
  nutrition: { fontSize: 12, color: '#aaa', marginRight: 12 },
  // Compact variant
  compactCard: {
    width: 140,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginRight: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  compactImg: {
    height: 80,
    backgroundColor: '#f5f0e8',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  compactEmoji: { fontSize: 32 },
  compactName: { fontSize: 14, fontWeight: '600' },
  compactMeta: { fontSize: 11, color: '#999', marginTop: 2 },
});
