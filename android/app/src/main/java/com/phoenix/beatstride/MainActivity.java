package com.phoenix.beatstride;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(com.phoenix.beatstride.BeatStrideMetronomePlugin.class);
        registerPlugin(com.phoenix.beatstride.BeatStrideWakeLockPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
