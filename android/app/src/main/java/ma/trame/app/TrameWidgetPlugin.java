package ma.trame.app;

import android.content.ContentUris;
import android.content.ContentValues;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.provider.CalendarContract;
import java.util.Calendar;
import java.util.TimeZone;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Pont entre l'appli web et le widget : rafraîchissement et actions lancées depuis le widget. */
@CapacitorPlugin(name = "TrameWidget")
public class TrameWidgetPlugin extends Plugin {
    private static JSObject pending;

    /** Mémorise l'action demandée par le widget (lue ensuite par le JavaScript). */
    static void capture(Intent i) {
        if (i == null) return;
        // Texte partagé depuis une autre appli (Keep, WhatsApp, Gmail…)
        if (Intent.ACTION_SEND.equals(i.getAction()) && "text/plain".equals(i.getType())) {
            String text = i.getStringExtra(Intent.EXTRA_TEXT);
            if (text == null || text.trim().isEmpty()) return;
            JSObject o = new JSObject();
            o.put("action", "shared");
            o.put("text", text);
            o.put("subject", i.getStringExtra(Intent.EXTRA_SUBJECT) == null ? "" : i.getStringExtra(Intent.EXTRA_SUBJECT));
            pending = o;
            i.setAction(Intent.ACTION_MAIN);
            return;
        }
        String action = i.getStringExtra("trame_action");
        if (action == null) return;
        JSObject o = new JSObject();
        o.put("action", action);
        if (i.hasExtra("id")) o.put("id", i.getStringExtra("id"));
        if (i.hasExtra("start")) o.put("start", i.getLongExtra("start", 0));
        if (i.hasExtra("day")) o.put("day", i.getLongExtra("day", 0));
        o.put("local", i.getBooleanExtra("local", false));
        pending = o;
        i.removeExtra("trame_action");
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        TrameWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    /** Identifiants des rendez-vous « toute la journée » répétés chaque année (anniversaires, y compris ceux
     *  que Google Agenda range désormais dans l'agenda principal), sur la plage demandée. */
    @PluginMethod
    public void yearlyAllDayIds(PluginCall call) {
        long from = call.getLong("from", 0L), to = call.getLong("to", 0L);
        JSArray ids = new JSArray();
        for (String id : WidgetData.yearlyAllDayIds(getContext(), from, to)) ids.put(id);
        JSObject r = new JSObject();
        r.put("ids", ids);
        call.resolve(r);
    }

    // ——— Modification des rendez-vous répétitifs, directement dans l'agenda du téléphone ———

    /** Minuit UTC du jour local d'un horodatage (format des journées entières dans CalendarContract). */
    private static long utcMidnight(long t) {
        Calendar l = Calendar.getInstance(); l.setTimeInMillis(t);
        Calendar u = Calendar.getInstance(TimeZone.getTimeZone("UTC")); u.clear();
        u.set(l.get(Calendar.YEAR), l.get(Calendar.MONTH), l.get(Calendar.DAY_OF_MONTH));
        return u.getTimeInMillis();
    }

    private static void putColor(ContentValues v, String color) {
        if (color == null) return;
        if (color.isEmpty()) v.putNull(CalendarContract.Events.EVENT_COLOR);
        else v.put(CalendarContract.Events.EVENT_COLOR, Color.parseColor(color));
    }

    /** « Cette occurrence seulement » : exception de la série avec les nouvelles valeurs. */
    @PluginMethod
    public void modifyOccurrence(PluginCall call) {
        try {
            String id = call.getString("id");
            long instance = call.getLong("instanceDate");
            long start = call.getLong("start"), end = call.getLong("end");
            boolean allDay = Boolean.TRUE.equals(call.getBoolean("allDay", false));
            ContentValues v = new ContentValues();
            v.put(CalendarContract.Events.ORIGINAL_INSTANCE_TIME, instance);
            v.put(CalendarContract.Events.STATUS, CalendarContract.Events.STATUS_CONFIRMED);
            if (call.getString("title") != null) v.put(CalendarContract.Events.TITLE, call.getString("title"));
            if (call.getString("location") != null) v.put(CalendarContract.Events.EVENT_LOCATION, call.getString("location"));
            v.put(CalendarContract.Events.ALL_DAY, allDay ? 1 : 0);
            if (allDay) {
                v.put(CalendarContract.Events.DTSTART, utcMidnight(start));
                v.put(CalendarContract.Events.DTEND, utcMidnight(end - 60000L) + 86400000L);
                v.put(CalendarContract.Events.EVENT_TIMEZONE, "UTC");
            } else {
                v.put(CalendarContract.Events.DTSTART, start);
                v.put(CalendarContract.Events.DTEND, end);
                v.put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());
            }
            putColor(v, call.getString("color"));
            Uri uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_EXCEPTION_URI, Long.parseLong(id));
            Uri r = getContext().getContentResolver().insert(uri, v);
            if (r == null) { call.reject("exception"); return; }
            JSObject o = new JSObject(); o.put("id", r.getLastPathSegment()); call.resolve(o);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    /** « Toute la série » : titre, lieu, couleur, heure et durée appliqués à la série (décalage relatif). */
    @PluginMethod
    public void modifySeries(PluginCall call) {
        try {
            long id = Long.parseLong(call.getString("id"));
            long shift = call.getLong("shift", 0L);
            long duration = call.getLong("duration", 3600000L);
            boolean allDay = Boolean.TRUE.equals(call.getBoolean("allDay", false));
            ContentResolver cr = getContext().getContentResolver();
            Uri uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id);
            long dtstart = 0;
            try (Cursor c = cr.query(uri, new String[]{CalendarContract.Events.DTSTART}, null, null, null)) {
                if (c != null && c.moveToFirst()) dtstart = c.getLong(0);
            }
            ContentValues v = new ContentValues();
            if (call.getString("title") != null) v.put(CalendarContract.Events.TITLE, call.getString("title"));
            if (call.getString("location") != null) v.put(CalendarContract.Events.EVENT_LOCATION, call.getString("location"));
            v.put(CalendarContract.Events.ALL_DAY, allDay ? 1 : 0);
            long newStart = dtstart + shift;
            if (allDay) {
                v.put(CalendarContract.Events.DTSTART, utcMidnight(newStart));
                v.put(CalendarContract.Events.EVENT_TIMEZONE, "UTC");
                v.put(CalendarContract.Events.DURATION, "P" + Math.max(1, Math.round(duration / 86400000.0)) + "D");
            } else {
                v.put(CalendarContract.Events.DTSTART, newStart);
                v.put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());
                v.put(CalendarContract.Events.DURATION, "P" + (duration / 1000L) + "S");
            }
            boolean single = Boolean.TRUE.equals(call.getBoolean("single", false));
            if (single) { // rendez-vous simple : DTEND au lieu de DURATION
                v.putNull(CalendarContract.Events.DURATION);
                v.put(CalendarContract.Events.DTEND, allDay ? utcMidnight(newStart) + Math.max(1, Math.round(duration / 86400000.0)) * 86400000L : newStart + duration);
            } else v.putNull(CalendarContract.Events.DTEND);
            if (call.getString("rrule") != null) v.put(CalendarContract.Events.RRULE, call.getString("rrule"));
            putColor(v, call.getString("color"));
            cr.update(uri, v, null, null);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    /** Couleur d'un rendez-vous ("" = couleur de l'agenda). */
    @PluginMethod
    public void setEventColor(PluginCall call) {
        try {
            ContentValues v = new ContentValues();
            putColor(v, call.getString("color", ""));
            Uri uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, Long.parseLong(call.getString("id")));
            getContext().getContentResolver().update(uri, v, null, null);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    /** Envoie du texte à une appli précise (ex. Google Keep) ; sinon, feuille de partage du système. */
    @PluginMethod
    public void shareTo(PluginCall call) {
        String pkg = call.getString("package");
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_SUBJECT, call.getString("title", ""));
        send.putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
        send.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        JSObject r = new JSObject();
        try {
            if (pkg != null && getContext().getPackageManager().getLaunchIntentForPackage(pkg) != null) {
                send.setPackage(pkg);
                getContext().startActivity(send);
                r.put("direct", true);
            } else {
                Intent chooser = Intent.createChooser(send, call.getString("title", "Trame"));
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
                r.put("direct", false);
            }
            call.resolve(r);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void consumeLaunch(PluginCall call) {
        JSObject o = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(o);
    }
}
