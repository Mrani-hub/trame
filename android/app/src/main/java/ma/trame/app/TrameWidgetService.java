package ma.trame.app;

import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.ArrayList;
import java.util.List;

/** Fournit les lignes de la liste du widget. */
public class TrameWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext(), intent.getLongExtra("day", WidgetData.dayStart(0)));
    }

    static final class Factory implements RemoteViewsFactory {
        private final Context ctx;
        private final long day;
        private List<WidgetData.Item> items = new ArrayList<>();

        Factory(Context ctx, long day) { this.ctx = ctx; this.day = day; }

        @Override public void onCreate() { }
        @Override public void onDataSetChanged() { items = WidgetData.load(ctx).items(ctx, day); }
        @Override public void onDestroy() { items.clear(); }
        @Override public int getCount() { return items.size(); }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 2; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return false; }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position >= items.size()) return null;
            WidgetData.Item it = items.get(position);
            if (it.type == 0) {
                RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_section);
                rv.setTextViewText(R.id.w_sec, it.title);
                return rv;
            }
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_item);
            rv.setTextViewText(R.id.w_t1, it.t1);
            rv.setTextViewText(R.id.w_t2, it.t2);
            rv.setViewVisibility(R.id.w_t2, it.t2.isEmpty() ? View.GONE : View.VISIBLE);
            rv.setTextViewText(R.id.w_name, it.type == 2 ? "○  " + it.title : it.title);
            rv.setTextViewText(R.id.w_info, it.info);
            rv.setViewVisibility(R.id.w_info, it.info.isEmpty() ? View.GONE : View.VISIBLE);
            rv.setInt(R.id.w_bar, "setBackgroundColor", it.color != 0 ? (it.color | 0xFF000000) : 0xFF6EA8DC);
            Intent fill = new Intent();
            if (it.type == 1) fill.putExtra("trame_action", "event").putExtra("id", it.id).putExtra("start", it.start).putExtra("local", it.local);
            else fill.putExtra("trame_action", "task").putExtra("id", it.id);
            rv.setOnClickFillInIntent(R.id.w_row, fill);
            return rv;
        }
    }
}
