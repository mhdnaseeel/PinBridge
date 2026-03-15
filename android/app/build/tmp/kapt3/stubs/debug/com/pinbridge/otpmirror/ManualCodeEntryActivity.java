package com.pinbridge.otpmirror;

@dagger.hilt.android.AndroidEntryPoint()
@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000(\n\u0002\u0018\u0002\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0002\b\u0005\n\u0002\u0010\u0002\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0010\u000e\n\u0000\b\u0007\u0018\u00002\u00020\u0001B\u0005\u00a2\u0006\u0002\u0010\u0002J\u0012\u0010\t\u001a\u00020\n2\b\u0010\u000b\u001a\u0004\u0018\u00010\fH\u0014J\u0010\u0010\r\u001a\u00020\n2\u0006\u0010\u000e\u001a\u00020\u000fH\u0002R\u001e\u0010\u0003\u001a\u00020\u00048\u0006@\u0006X\u0087.\u00a2\u0006\u000e\n\u0000\u001a\u0004\b\u0005\u0010\u0006\"\u0004\b\u0007\u0010\b\u00a8\u0006\u0010"}, d2 = {"Lcom/pinbridge/otpmirror/ManualCodeEntryActivity;", "Landroidx/appcompat/app/AppCompatActivity;", "()V", "pairingRepository", "Lcom/pinbridge/otpmirror/data/PairingRepository;", "getPairingRepository", "()Lcom/pinbridge/otpmirror/data/PairingRepository;", "setPairingRepository", "(Lcom/pinbridge/otpmirror/data/PairingRepository;)V", "onCreate", "", "savedInstanceState", "Landroid/os/Bundle;", "performPairing", "code", "", "app_debug"})
public final class ManualCodeEntryActivity extends androidx.appcompat.app.AppCompatActivity {
    @javax.inject.Inject()
    public com.pinbridge.otpmirror.data.PairingRepository pairingRepository;
    
    public ManualCodeEntryActivity() {
        super();
    }
    
    @org.jetbrains.annotations.NotNull()
    public final com.pinbridge.otpmirror.data.PairingRepository getPairingRepository() {
        return null;
    }
    
    public final void setPairingRepository(@org.jetbrains.annotations.NotNull()
    com.pinbridge.otpmirror.data.PairingRepository p0) {
    }
    
    @java.lang.Override()
    protected void onCreate(@org.jetbrains.annotations.Nullable()
    android.os.Bundle savedInstanceState) {
    }
    
    private final void performPairing(java.lang.String code) {
    }
}