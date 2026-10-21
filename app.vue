<script setup lang="ts">
import { uiText as t } from '~~/shared/i18n/ui-copy'

useHead({
  htmlAttrs: { lang: 'es' },
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
  ],
})

useSeoMeta({
  title: 'Morti',
  description: t('appDescription'),
  ogTitle: 'Morti',
  ogDescription: t('appDescription'),
  twitterCard: 'summary',
})
</script>

<template>
  <UApp>
    <UMain>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UMain>
  </UApp>
</template>
