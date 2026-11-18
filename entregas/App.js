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

const MATERIAS = [
  'Biología',
  'Emprendimiento y Gestión',
  'Cívica',
  'Religión',
  'Física',
  'Historia',
  'Inglés',
  'Lengua y Literatura',
  'Matemáticas',
  'Química',
  'Formación y Orientación Laboral',
  'CAD',
  'Programación',
  'Programación móvil',
  'Sistemas operativos',
  'Soporte técnico',
];

let Notifications = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  Notifications = null;
}

const canNotify = Platform.OS !== 'web' && Notifications !== null;

if (canNotify) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {}
}

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
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec((s || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (toISO(d) !== (s || '').trim()) return null;
  return d;
};
const normTime = (t) => {
  const m = /^([0-9]{1,2}:[0-9]{2})$/.exec((t || '').trim());
  if (!m) return null;
  const [h, min] = m[1].split(':').map(Number);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
};
const dueAt = (task) => {
  const d = parseISO(task.date);
  if (!d) return new Date(0);
  const [h, m] = (task.time || '23:59').split(':').map(Number);
  d.setHours(h, m, 0, 0);
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
  const time = task.time || '23:59';
  if (n < 0) return { color: C.late, label: n === -1 ? 'Venció ayer' : `Venció hace ${-n} días` };
  if (n === 0) {
    const passed = dueAt(task) < new Date();
    return { color: C.late, label: `${passed ? 'Venció' : 'Vence'} hoy a las ${time}` };
  }
  if (n === 1) return { color: C.soon, label: `Vence mañana a las ${time}` };
  if (n <= 3) return { color: C.soon, label: `Vence en ${n} días, a las ${time}` };
  return { color: C.ok, label: `Vence en ${n} días, a las ${time}` };
}

async function ensurePermission() {
  if (!canNotify) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('entregas', {
        name: 'Entregas',
        importance: Notifications.AndroidImportance.MAX,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return !!asked.granted;
  } catch (e) {
    return false;
  }
}

async function scheduleFor(task) {
  if (!canNotify) return null;
  const when = dueAt(task);
  if (when <= new Date()) return null;
  if (!(await ensurePermission())) return null;
  try {
    const type = Notifications.SchedulableTriggerInputTypes?.DATE;
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Es hora de entregar',
        body: `${task.subject}: ${task.title}`,
        sound: true,
      },
      trigger: type ? { type, date: when, channelId: 'entregas' } : when,
    });
  } catch (e) {
    return null;
  }
}

async function cancelNotif(id) {
  if (!canNotify || !id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (e) {}
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
  const [time, setTime] = useState('23:59');
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
      return dueAt(a) - dueAt(b);
    });
  }, [tasks]);

  const pending = tasks.filter((t) => !t.done);
  const urgent = pending.filter((t) => daysLeft(t.date) <= 1).length;

  const addTask = async () => {
    if (!title.trim()) return setError('Escribe qué tienes que entregar.');
    if (!subject) return setError('Elige una materia.');
    if (!parseISO(date)) return setError('Usa la fecha como AAAA-MM-DD, por ejemplo 2026-12-04.');
    const t = normTime(time);
    if (!t) return setError('Usa la hora como HH:MM, por ejemplo 18:30.');

    const task = {
      id: String(Date.now()),
      title: title.trim(),
      subject,
      date: date.trim(),
      time: t,
      done: false,
      notifId: null,
    };
    task.notifId = await scheduleFor(task);
    setTasks((prev) => [...prev, task]);
    setTitle('');

    if (canNotify && !task.notifId && dueAt(task) > new Date()) {
      setError('La tarea se guardó, pero no se pudo programar el aviso. Revisa el permiso de notificaciones.');
    } else {
      setError('');
    }
  };

  const toggle = async (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    let notifId = null;
    if (!task.done) {
      await cancelNotif(task.notifId);
    } else {
      notifId = await scheduleFor(task);
    }
    setTasks((prev) => prev.map((item) => (
      item.id === id ? { ...item, done: !item.done, notifId } : item
    )));
  };

  const remove = async (id) => {
    const task = tasks.find((item) => item.id === id);
    if (task) await cancelNotif(task.notifId);
    setTasks((prev) => prev.filter((item) => item.id !== id));
  };

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
        <TextInput
          style={s.input}
          placeholder="¿Qué debes entregar?"
          placeholderTextColor={C.muted}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={s.fieldLabel}>Materia</Text>
        <View style={s.chips}>
          {MATERIAS.map((materia) => (
            <Pressable
              key={materia}
              onPress={() => setSubject(materia)}
              accessibilityRole="button"
              accessibilityState={{ selected: subject === materia }}
              style={[s.chip, subject === materia && s.chipOn]}
            >
              <Text style={[s.chipText, subject === materia && s.chipOnText]}>{materia}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={s.input}
          placeholder="Fecha límite (AAAA-MM-DD)"
          placeholderTextColor={C.muted}
          value={date}
          onChangeText={setDate}
          autoCapitalize="none"
        />
        <TextInput
          style={s.input}
          placeholder="Hora límite (HH:MM, 24 horas)"
          placeholderTextColor={C.muted}
          value={time}
          onChangeText={setTime}
          autoCapitalize="none"
        />

        <View style={s.chips}>
          {['08:00', '12:00', '18:00', '23:59'].map((hora) => (
            <Pressable key={hora} onPress={() => setTime(hora)} style={s.chip}>
              <Text style={s.chipText}>{hora}</Text>
            </Pressable>
          ))}
        </View>

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
        keyExtractor={(task) => task.id}
        ListHeaderComponent={Header}
        ListEmptyComponent={loaded ? (
          <Text style={s.empty}>Agrega tu primera tarea arriba. Aparecerá aquí, la más urgente primero.</Text>
        ) : null}
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
                <Text style={s.cardMeta}>{item.subject} · {fmt(item.date)}, {item.time || '23:59'}</Text>
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
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: C.ink,
    marginBottom: 10,
    backgroundColor: '#FAFBFD',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: C.ink, fontSize: 13 },
  chipOn: { backgroundColor: C.ink, borderColor: C.ink },
  chipOnText: { color: '#fff', fontWeight: '700' },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 8 },
  error: { color: C.late, fontSize: 14, marginBottom: 10 },
  addBtn: { backgroundColor: C.ink, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  empty: { color: C.muted, fontSize: 15, textAlign: 'center', marginTop: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 10,
    borderLeftWidth: 6,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: C.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkMark: { color: '#fff', fontWeight: '800', fontSize: 14 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
  doneText: { textDecorationLine: 'line-through', color: C.done },
  cardMeta: { fontSize: 14, color: C.muted, marginTop: 2 },
  cardStatus: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  del: { paddingHorizontal: 8, paddingVertical: 6 },
  delText: { color: C.muted, fontSize: 13 },
});
