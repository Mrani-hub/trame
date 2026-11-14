package ma.trame.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

/** Widget « Trame — ma journée » : rendez-vous et tâches d'un jour, navigation jour par jour. */
public class TrameWidgetProvider extends AppWidgetProvider {
    static final String ACT_PREV = "ma.trame.app.widget.PREV";
    static final String ACT_NEXT = "ma.trame.app.widget.NEXT";
    static final String ACT_TODAY = "ma.trame.app.widget.TODAY";
    static final String ACT_MIDNIGHT = "ma.trame.app.widget.MIDNIGHT";
    private static final String PREFS = "trame_widget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) update(ctx, mgr, id);
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.w_list);
        scheduleMidnight(ctx);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent.getAction();
        if (a == null) return;
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        switch (a) {
            case ACT_PREV: case ACT_NEXT: case ACT_TODAY: {
                if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return;
                int off = ACT_TODAY.equals(a) ? 0 : p.getInt("off_" + id, 0) + (ACT_NEXT.equals(a) ? 1 : -1);
                p.edit().putInt("off_" + id, off).apply();
                AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
                update(ctx, mgr, id);
                mgr.notifyAppWidgetViewDataChanged(id, R.id.w_list);
                break;
            }
            case ACT_MIDNIGHT:
            case Intent.ACTION_TIMEZONE_CHANGED:
            case Intent.ACTION_TIME_CHANGED:
            case Intent.ACTION_LOCALE_CHANGED:
                p.edit().clear().apply(); // retour à « aujourd'hui » au changement de jour
                refreshAll(ctx);
                scheduleMidnight(ctx);
                break;
            default:
        }
    }

    @Override
    public void onDisabled(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(broadcast(ctx, ACT_MIDNIGHT, 0, 1));
    }

    /** Appelé par l'appli après chaque modification. */
    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, TrameWidgetProvider.class));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) update(ctx, mgr, id);
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.w_list);
    }

    static void update(Context ctx, AppWidgetManager mgr, int id) {
        WidgetData d = WidgetData.load(ctx);
        int off = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt("off_" + id, 0);
        long day = WidgetData.dayStart(off);
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_trame);
        rv.setTextViewText(R.id.w_title, off == 0 ? d.t("today") + " · " + d.title(day) : d.title(day));
        String sub = d.subtitle(day);
        rv.setTextViewText(R.id.w_sub, sub);
        rv.setViewVisibility(R.id.w_sub, sub.isEmpty() ? View.GONE : View.VISIBLE);
        rv.setViewVisibility(R.id.w_today, off == 0 ? View.GONE : View.VISIBLE);
        rv.setTextViewText(R.id.w_empty, d.t(off == 0 ? "emptyToday" : "empty"));

        Intent svc = new Intent(ctx, TrameWidgetService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        svc.putExtra("day", day);
        svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
        rv.setRemoteAdapter(R.id.w_list, svc);
        rv.setEmptyView(R.id.w_list, R.id.w_empty);

        rv.setOnClickPendingIntent(R.id.w_prev, broadcast(ctx, ACT_PREV, id, 2));
        rv.setOnClickPendingIntent(R.id.w_next, broadcast(ctx, ACT_NEXT, id, 3));
        rv.setOnClickPendingIntent(R.id.w_today, broadcast(ctx, ACT_TODAY, id, 4));
        rv.setOnClickPendingIntent(R.id.w_add, activity(ctx, new Intent().putExtra("trame_action", "capture"), id * 10 + 5, false));
        rv.setOnClickPendingIntent(R.id.w_head, activity(ctx, new Intent().putExtra("trame_action", "day").putExtra("day", day), id * 10 + 6, false));
        rv.setOnClickPendingIntent(R.id.w_empty, activity(ctx, new Intent().putExtra("trame_action", "day").putExtra("day", day), id * 10 + 7, false));
        rv.setPendingIntentTemplate(R.id.w_list, activity(ctx, new Intent(), id * 10 + 8, true));
        mgr.updateAppWidget(id, rv);
    }

    private static PendingIntent broadcast(Context ctx, String action, int id, int k) {
        Intent i = new Intent(ctx, TrameWidgetProvider.class).setAction(action).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        return PendingIntent.getBroadcast(ctx, id * 10 + k, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent activity(Context ctx, Intent extras, int req, boolean template) {
        Intent i = new Intent(ctx, MainActivity.class).putExtras(extras).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (template ? PendingIntent.FLAG_MUTABLE : PendingIntent.FLAG_IMMUTABLE);
        return PendingIntent.getActivity(ctx, req, i, flags);
    }

    private static void scheduleMidnight(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.set(AlarmManager.RTC, WidgetData.dayStart(1) + 60000L, broadcast(ctx, ACT_MIDNIGHT, 0, 1));
    }
}
