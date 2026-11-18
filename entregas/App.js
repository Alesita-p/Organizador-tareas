import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'tareas-v1';

const C = {
  bg: '#EEF1F6',
  ink: '#1B2640',
  muted: '#6B7690',
  card: '#FFFFFF',
  line: '#D9DFEA',
  late: '#D64545',
  soon: '#E39B00',
  ok: '#2E9E6B',
  done: '#A7B0C3',
};

const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const addDays = (n) => {
  const d = startOfToday();
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const parseISO = (s) => {
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(s.trim())
    ? /^\d{4}-\d{2}-\d{2}$/.exec(s.trim())
    : null;
  if (!m) return null;
  const parts = s.trim().split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (toISO(d) !== s.trim()) return null;
  return d;
};
const daysLeft = (iso) => {
  const d = parseISO(iso);
  if (!d) return 0;
  return Math.round((d - startOfToday()) / 86400000);
};

function urgency(task) {
  if (task.done) return { color: C.done, label: 'Completada' };
  const n = daysLeft(task.date);
  if (n < 0) return { color: C.late, label: n === -1 ? 'Venció ayer' : `Venció hace ${-n} días` };
  if (n === 0) return { color: C.late, label: 'Vence hoy' };
  if (n === 1) return { color: C.soon, label: 'Vence mañana' };
  if (n <= 3) return { color: C.soon, label: `Vence en ${n} días` };
  return { color: C.ok, label: `Vence en ${n} días` };
}

const fmt = (iso) => {
  const d = parseISO(iso);
  if (!d) return 'Fecha inválida';
  return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
};

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState(addDays(1));
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setTasks(JSON.parse(raw));
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)).catch(() => {});
  }, [tasks, loaded]);

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.date.localeCompare(b.date);
    });
  }, [tasks]);

  const pending = tasks.filter((t) => !t.done);
  const urgent = pending.filter((t) => daysLeft(t.date) <= 1).length;

  const addTask = () => {
    if (!title.trim()) return setError('Escribe qué tienes que entregar.');
    if (!subject.trim()) return setError('Indica la materia.');
    if (!parseISO(date)) return setError('Usa la fecha como AAAA-MM-DD, por ejemplo 2026-12-04.');
    setTasks((prev) => [
      ...prev,
      { id: String(Date.now()), title: title.trim(), subject: subject.trim(), date: date.trim(), done: false },
    ]);
    setTitle('');
    setSubject('');
    setDate(addDays(1));
    setError('');
  };

  const toggle = (id) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) => setTasks((prev) => prev.filter((t) => t.id !== id));

  const Header = (
    <View>
      <Text style={s.h1}>Mis entregas</Text>
      <Text style={s.summary}>
        {pending.length === 0
          ? 'No tienes entregas pendientes.'
          : urgent > 0
          ? `${urgent} ${urgent === 1 ? 'entrega vence' : 'entregas vencen'} hoy, mañana o ya pasaron.`
          : `${pending.length} pendientes, ninguna para hoy ni mañana.`}
      </Text>

      <View style={s.form}>
        <TextInput style={s.input} placeholder="¿Qué debes entregar?" placeholderTextColor={C.muted} value={title} onChangeText={setTitle} />
        <TextInput style={s.input} placeholder="Materia" placeholderTextColor={C.muted} value={subject} onChangeText={setSubject} />
        <TextInput
          style={s.input}
          placeholder="Fecha límite (AAAA-MM-DD)"
          placeholderTextColor={C.muted}
          value={date}
          onChangeText={setDate}
          autoCapitalize="none"
        />
        <View style={s.chips}>
          {[
            ['Hoy', 0],
            ['Mañana', 1],
            ['En 1 semana', 7],
          ].map(([label, n]) => (
            <Pressable key={label} onPress={() => setDate(addDays(n))} style={s.chip}>
              <Text style={s.chipText}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Pressable onPress={addTask} style={s.addBtn}>
          <Text style={s.addBtnText}>Agregar tarea</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        style={s.list}
        contentContainerStyle={s.listContent}
        data={sorted}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={Header}
        ListEmptyComponent={loaded ? <Text style={s.empty}>Agrega tu primera tarea arriba. Aparecerá aquí, la más urgente primero.</Text> : null}
        renderItem={({ item }) => {
          const u = urgency(item);
          return (
            <View style={[s.card, { borderLeftColor: u.color }]}>
              <Pressable
                onPress={() => toggle(item.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done }}
                accessibilityLabel={`Marcar ${item.title} como completada`}
                style={[s.check, item.done && { backgroundColor: C.ok, borderColor: C.ok }]}
              >
                {item.done ? <Text style={s.checkMark}>✓</Text> : null}
              </Pressable>
              <View style={s.cardBody}>
                <Text style={[s.cardTitle, item.done && s.doneText]}>{item.title}</Text>
                <Text style={s.cardMeta}>{item.subject} · {fmt(item.date)}</Text>
                <Text style={[s.cardStatus, { color: u.color }]}>{u.label}</Text>
              </View>
              <Pressable onPress={() => remove(item.id)} accessibilityLabel="Eliminar tarea" style={s.del}>
                <Text style={s.delText}>Eliminar</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  list: { flex: 1 },
  listContent: { padding: 20, width: '100%', maxWidth: 640, alignSelf: 'center', paddingBottom: 60 },
  h1: { fontSize: 32, fontWeight: '800', color: C.ink, letterSpacing: -0.5, marginTop: 8 },
  summary: { fontSize: 15, color: C.muted, marginTop: 4, marginBottom: 20 },
  form: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: C.line },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.ink, marginBottom: 10, backgroundColor: '#FAFBFD' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: C.ink, fontSize: 13 },
  error: { color: C.late, fontSize: 14, marginBottom: 10 },
  addBtn: { backgroundColor: C.ink, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  empty: { color: C.muted, fontSize: 15, textAlign: 'center', marginTop: 12 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 10, borderLeftWidth: 6, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.line },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.muted, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  checkMark: { color: '#fff', fontWeight: '800', fontSize: 14 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
  doneText: { textDecorationLine: 'line-through', color: C.done },
  cardMeta: { fontSize: 14, color: C.muted, marginTop: 2 },
  cardStatus: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  del: { paddingHorizontal: 8, paddingVertical: 6 },
  delText: { color: C.muted, fontSize: 13 },
});
