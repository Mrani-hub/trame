package ma.trame.app;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/** Données du widget : agendas du téléphone (lus directement) + widget.json écrit par l'appli. */
final class WidgetData {
    static final long DAY = 86400000L;

    static final class Item {
        int type; // 0 = section, 1 = rendez-vous, 2 = tâche
        String title = "", info = "", t1 = "", t2 = "", id = "";
        int color;
        long start, end;
        boolean local, allDay, high;
    }

    private static final String[] HIJRI_FR = {"Mouharram", "Safar", "Rabia I", "Rabia II", "Joumada I", "Joumada II", "Rajab", "Chaabane", "Ramadan", "Chaoual", "Dhou al-qi’da", "Dhou al-hijja"};
    private static final String[] HIJRI_AR = {"محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"};

    String lang = "fr", calMode = "both";
    int hijriOffset = 0;
    boolean arabDigits = false;
    Set<String> hidden = new HashSet<>();
    JSONArray localEvents = new JSONArray(), tasks = new JSONArray();

    static WidgetData load(Context c) {
        WidgetData d = new WidgetData();
        try {
            File f = new File(c.getFilesDir(), "widget.json");
            if (f.exists()) {
                byte[] buf = new byte[(int) f.length()];
                try (FileInputStream in = new FileInputStream(f)) {
                    int off = 0;
                    while (off < buf.length) { int r = in.read(buf, off, buf.length - off); if (r < 0) break; off += r; }
                }
                JSONObject j = new JSONObject(new String(buf, StandardCharsets.UTF_8));
                d.lang = j.optString("lang", "fr");
                d.calMode = j.optString("calMode", "both");
                d.hijriOffset = j.optInt("hijriOffset", 0);
                d.arabDigits = "arab".equals(j.optString("digits"));
                JSONArray h = j.optJSONArray("hiddenCals");
                if (h != null) for (int i = 0; i < h.length(); i++) d.hidden.add(h.optString(i));
                if (j.optJSONArray("localEvents") != null) d.localEvents = j.optJSONArray("localEvents");
                if (j.optJSONArray("tasks") != null) d.tasks = j.optJSONArray("tasks");
            } else {
                d.lang = Locale.getDefault().getLanguage().equals("ar") ? "ar" : "fr";
            }
        } catch (Exception ignored) { }
        return d;
    }

    static long dayStart(int offset) {
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
        cal.add(Calendar.DAY_OF_MONTH, offset);
        return cal.getTimeInMillis();
    }

    private static long nextDay(long day) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(day);
        cal.add(Calendar.DAY_OF_MONTH, 1);
        return cal.getTimeInMillis();
    }

    boolean ar() { return "ar".equals(lang); }

    String t(String key) {
        boolean a = ar();
        switch (key) {
            case "today": return a ? "اليوم" : "Aujourd'hui";
            case "empty": return a ? "لا مواعيد" : "Aucun rendez-vous";
            case "emptyToday": return a ? "لا مواعيد اليوم" : "Journée libre";
            case "todo": return a ? "للإنجاز" : "À faire";
            case "events": return a ? "المواعيد" : "Rendez-vous";
            case "allDay": return a ? "اليوم كله" : "Journée";
            case "late": return a ? "متأخرة" : "En retard";
            case "reminder": return a ? "تذكير" : "Rappel";
            default: return key;
        }
    }

    String digits(String s) {
        StringBuilder b = new StringBuilder();
        for (char ch : s.toCharArray()) {
            if (ch >= '٠' && ch <= '٩') ch = (char) ('0' + (ch - '٠'));
            if (arabDigits && ch >= '0' && ch <= '9') ch = (char) ('٠' + (ch - '0'));
            b.append(ch);
        }
        return b.toString();
    }

    private Locale locale() { return ar() ? new Locale("ar", "MA") : Locale.FRENCH; }

    String hijri(long day) {
        android.icu.util.IslamicCalendar ic = new android.icu.util.IslamicCalendar();
        ic.setCalculationType(android.icu.util.IslamicCalendar.CalculationType.ISLAMIC_UMALQURA);
        ic.setTimeInMillis(day + 12 * 3600000L + hijriOffset * DAY);
        int d = ic.get(android.icu.util.Calendar.DAY_OF_MONTH);
        int m = ic.get(android.icu.util.Calendar.MONTH);
        int y = ic.get(android.icu.util.Calendar.YEAR);
        return digits(d + " " + (ar() ? HIJRI_AR[m] : HIJRI_FR[m]) + " " + y + (ar() ? " هـ" : " H"));
    }

    private String cap(String s) { return s.isEmpty() ? s : s.substring(0, 1).toUpperCase(locale()) + s.substring(1); }

    String title(long day) {
        String wd = cap(new SimpleDateFormat("EEEE", locale()).format(new Date(day)));
        if ("hijri".equals(calMode)) return digits(wd) + " " + hijri(day);
        return digits(cap(new SimpleDateFormat("EEEE d MMMM", locale()).format(new Date(day))));
    }

    String subtitle(long day) { return "both".equals(calMode) ? hijri(day) : ""; }

    String hm(long ms) { return digits(new SimpleDateFormat("HH:mm", Locale.ROOT).format(new Date(ms))); }

    List<Item> items(Context c, long day) {
        long end = nextDay(day);
        List<Item> events = new ArrayList<>();
        // 1. Agendas du téléphone
        if (c.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED) {
            Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
            ContentUris.appendId(b, day - DAY);
            ContentUris.appendId(b, end + DAY);
            String[] proj = {CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN,
                    CalendarContract.Instances.END, CalendarContract.Instances.ALL_DAY, CalendarContract.Instances.CALENDAR_ID,
                    CalendarContract.Instances.EVENT_LOCATION, CalendarContract.Instances.DISPLAY_COLOR, CalendarContract.Instances.VISIBLE};
            Calendar local = Calendar.getInstance();
            local.setTimeInMillis(day);
            Calendar utc = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
            utc.clear();
            utc.set(local.get(Calendar.YEAR), local.get(Calendar.MONTH), local.get(Calendar.DAY_OF_MONTH));
            long utcDay = utc.getTimeInMillis();
            try (Cursor cur = c.getContentResolver().query(b.build(), proj, null, null, CalendarContract.Instances.BEGIN + " ASC")) {
                while (cur != null && cur.moveToNext()) {
                    if (cur.getInt(8) == 0 || hidden.contains(String.valueOf(cur.getLong(5)))) continue;
                    boolean allDay = cur.getInt(4) == 1;
                    long s = cur.getLong(2), e = cur.getLong(3);
                    boolean inDay = allDay ? (s <= utcDay && e > utcDay) : (s < end && e > day);
                    if (!inDay) continue;
                    Item it = new Item();
                    it.type = 1; it.id = String.valueOf(cur.getLong(0)); it.title = nz(cur.getString(1)); it.start = s; it.end = e;
                    it.allDay = allDay; it.info = nz(cur.getString(6)); it.color = cur.getInt(7);
                    events.add(it);
                }
            } catch (Exception ignored) { }
        }
        // 2. Rendez-vous locaux de Trame
        for (int i = 0; i < localEvents.length(); i++) {
            JSONObject o = localEvents.optJSONObject(i);
            if (o == null) continue;
            long s = o.optLong("start"), e = o.optLong("end");
            if (!(s < end && e > day)) continue;
            Item it = new Item();
            it.type = 1; it.local = true; it.id = o.optString("id"); it.title = o.optString("title"); it.start = s; it.end = e;
            it.allDay = o.optBoolean("allDay"); it.info = o.optString("location"); it.color = 0xFF0F766E;
            events.add(it);
        }
        Collections.sort(events, (a, b2) -> a.allDay != b2.allDay ? (a.allDay ? -1 : 1) : Long.compare(a.start, b2.start));
        for (Item it : events) {
            if (it.allDay) { it.t1 = t("allDay"); continue; }
            it.t1 = hm(it.start);
            it.t2 = hm(it.end);
        }

        // 3. Tâches du jour (et retards, pour aujourd'hui)
        boolean isToday = day == dayStart(0);
        List<Item> todo = new ArrayList<>();
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject o = tasks.optJSONObject(i);
            if (o == null) continue;
            long due = o.optLong("due", 0), rem = o.optLong("remindAt", 0), plan = o.optLong("plannedStart", 0);
            boolean dueToday = due >= day && due < end, remToday = rem >= day && rem < end, planToday = plan >= day && plan < end;
            boolean late = isToday && due > 0 && due < day;
            if (!(dueToday || remToday || planToday || late)) continue;
            Item it = new Item();
            it.type = 2; it.id = o.optString("id"); it.title = o.optString("title"); it.high = o.optBoolean("high");
            long when = planToday ? plan : remToday ? rem : 0;
            it.start = when > 0 ? when : (late ? 0 : day + DAY - 1);
            it.t1 = when > 0 ? hm(when) : "";
            it.info = late ? t("late") : (o.optBoolean("reminder") ? t("reminder") : "");
            it.color = it.high ? 0xFFC2410C : 0xFF5D6B7A;
            todo.add(it);
        }
        Collections.sort(todo, (a, b2) -> Long.compare(a.start, b2.start));

        List<Item> out = new ArrayList<>(events);
        if (!todo.isEmpty()) {
            Item sec = new Item();
            sec.type = 0; sec.title = t("todo");
            out.add(sec);
            out.addAll(todo);
        }
        return out;
    }

    private static String nz(String s) { return s == null ? "" : s; }
}
