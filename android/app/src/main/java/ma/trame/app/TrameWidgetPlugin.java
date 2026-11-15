package ma.trame.app;

import android.content.Intent;
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

    @PluginMethod
    public void consumeLaunch(PluginCall call) {
        JSObject o = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(o);
    }
}
