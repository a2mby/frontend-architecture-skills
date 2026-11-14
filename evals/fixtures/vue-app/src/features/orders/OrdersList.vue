<script setup lang="ts">
import { ref } from "vue";
const orders = ref<string[]>([]);
</script>
<template><ul><li v-for="o in orders" :key="o">{{ o }}</li></ul></template>
