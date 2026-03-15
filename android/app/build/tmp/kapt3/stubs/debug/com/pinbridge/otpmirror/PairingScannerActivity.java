package com.pinbridge.otpmirror;

@dagger.hilt.android.AndroidEntryPoint()
@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000F\n\u0002\u0018\u0002\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\u000e\n\u0000\n\u0002\u0010\u000b\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0005\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0010\u0002\n\u0002\b\u0003\n\u0002\u0018\u0002\n\u0002\b\u0003\n\u0002\u0018\u0002\n\u0002\b\u0003\b\u0007\u0018\u00002\u00020\u0001B\u0005\u00a2\u0006\u0002\u0010\u0002J\u0010\u0010\u0012\u001a\u00020\u00132\u0006\u0010\u0014\u001a\u00020\u0006H\u0002J\u0012\u0010\u0015\u001a\u00020\u00132\b\u0010\u0016\u001a\u0004\u0018\u00010\u0017H\u0014J\b\u0010\u0018\u001a\u00020\u0013H\u0014J\u0010\u0010\u0019\u001a\u00020\u00132\u0006\u0010\u001a\u001a\u00020\u001bH\u0003J\b\u0010\u001c\u001a\u00020\u0013H\u0002J\b\u0010\u001d\u001a\u00020\u0013H\u0002R\u000e\u0010\u0003\u001a\u00020\u0004X\u0082.\u00a2\u0006\u0002\n\u0000R\u000e\u0010\u0005\u001a\u00020\u0006X\u0082D\u00a2\u0006\u0002\n\u0000R\u000e\u0010\u0007\u001a\u00020\bX\u0082\u000e\u00a2\u0006\u0002\n\u0000R\u001e\u0010\t\u001a\u00020\n8\u0006@\u0006X\u0087.\u00a2\u0006\u000e\n\u0000\u001a\u0004\b\u000b\u0010\f\"\u0004\b\r\u0010\u000eR\u001c\u0010\u000f\u001a\u0010\u0012\f\u0012\n \u0011*\u0004\u0018\u00010\u00060\u00060\u0010X\u0082\u0004\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u001e"}, d2 = {"Lcom/pinbridge/otpmirror/PairingScannerActivity;", "Landroidx/activity/ComponentActivity;", "()V", "cameraExecutor", "Ljava/util/concurrent/ExecutorService;", "cameraPermission", "", "hasHandled", "", "pairingRepository", "Lcom/pinbridge/otpmirror/data/PairingRepository;", "getPairingRepository", "()Lcom/pinbridge/otpmirror/data/PairingRepository;", "setPairingRepository", "(Lcom/pinbridge/otpmirror/data/PairingRepository;)V", "requestPermission", "Landroidx/activity/result/ActivityResultLauncher;", "kotlin.jvm.PlatformType", "handleQrResult", "", "json", "onCreate", "savedInstanceState", "Landroid/os/Bundle;", "onDestroy", "processImageProxy", "imageProxy", "Landroidx/camera/core/ImageProxy;", "showPermissionDenied", "startCamera", "app_debug"})
public final class PairingScannerActivity extends androidx.activity.ComponentActivity {
    @javax.inject.Inject()
    public com.pinbridge.otpmirror.data.PairingRepository pairingRepository;
    @org.jetbrains.annotations.NotNull()
    private final java.lang.String cameraPermission = "android.permission.CAMERA";
    private boolean hasHandled = false;
    private java.util.concurrent.ExecutorService cameraExecutor;
    @org.jetbrains.annotations.NotNull()
    private final androidx.activity.result.ActivityResultLauncher<java.lang.String> requestPermission = null;
    
    public PairingScannerActivity() {
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
    
    private final void startCamera() {
    }
    
    @android.annotation.SuppressLint(value = {"UnsafeOptInUsageError"})
    private final void processImageProxy(androidx.camera.core.ImageProxy imageProxy) {
    }
    
    private final void handleQrResult(java.lang.String json) {
    }
    
    @java.lang.Override()
    protected void onDestroy() {
    }
    
    private final void showPermissionDenied() {
    }
}