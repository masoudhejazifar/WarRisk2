package ir.masoud.riskwatch;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RiskNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
