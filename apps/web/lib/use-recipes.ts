'use client';

import * as React from 'react';
import { fetchRecipes } from './api';
import type { Recipe } from './recipes';

// Module-level cache — fetch once, share across all pages
let recipeCache: Recipe[] | null = null;
let fetchPromise: Promise<Recipe[]> | null = null;

async function loadAllRecipes(): Promise<Recipe[]> {
  if (recipeCache) return recipeCache;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetchRecipes({ limit: 100 })
    .then((res) => {
      recipeCache = res.data;
      return recipeCache;
    })
    .catch((err) => {
      fetchPromise = null; // Allow retry on next mount
      throw err;
    });

  return fetchPromise;
}

export function useRecipes() {
  const [recipes, setRecipes] = React.useState<Recipe[]>(recipeCache ?? []);
  const [loading, setLoading] = React.useState(!recipeCache);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (recipeCache) {
      setRecipes(recipeCache);
      setLoading(false);
      return;
    }

    let cancelled = false;

    loadAllRecipes()
      .then((data) => {
        if (!cancelled) {
          setRecipes(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError((err as Error).message || '加载菜谱失败');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { recipes, loading, error };
}
