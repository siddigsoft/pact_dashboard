package com.pact.workflow;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Enable edge-to-edge display - content extends behind system bars
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        
        // Make status bar and navigation bar transparent
        // Let the Capacitor StatusBar plugin handle icon appearance based on theme
        getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
        getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
    }
}
