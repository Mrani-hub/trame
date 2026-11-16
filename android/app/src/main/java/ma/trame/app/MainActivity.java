package ma.trame.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TrameWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        TrameWidgetPlugin.capture(this, getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        TrameWidgetPlugin.capture(this, intent);
    }
}
