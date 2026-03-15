package com.pinbridge.otpmirror;

@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000(\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0002\b\u0002\n\u0002\u0010\u000e\n\u0000\n\u0002\u0010\b\n\u0002\b\u0003\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\u0012\n\u0002\b\u0004\b\u00c7\u0002\u0018\u00002\u00020\u0001:\u0001\u000fB\u0007\b\u0002\u00a2\u0006\u0002\u0010\u0002J\u0016\u0010\b\u001a\u00020\u00042\u0006\u0010\t\u001a\u00020\n2\u0006\u0010\u000b\u001a\u00020\fJ\u0016\u0010\r\u001a\u00020\n2\u0006\u0010\u000e\u001a\u00020\u00042\u0006\u0010\u000b\u001a\u00020\fR\u000e\u0010\u0003\u001a\u00020\u0004X\u0082T\u00a2\u0006\u0002\n\u0000R\u000e\u0010\u0005\u001a\u00020\u0006X\u0082T\u00a2\u0006\u0002\n\u0000R\u000e\u0010\u0007\u001a\u00020\u0006X\u0082T\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u0010"}, d2 = {"Lcom/pinbridge/otpmirror/CryptoUtil;", "", "()V", "ALGORITHM", "", "IV_LENGTH_BYTE", "", "TAG_LENGTH_BIT", "decrypt", "encrypted", "Lcom/pinbridge/otpmirror/CryptoUtil$EncryptedData;", "secretKey", "", "encrypt", "plaintext", "EncryptedData", "app_debug"})
public final class CryptoUtil {
    @org.jetbrains.annotations.NotNull()
    private static final java.lang.String ALGORITHM = "AES/GCM/NoPadding";
    private static final int TAG_LENGTH_BIT = 128;
    private static final int IV_LENGTH_BYTE = 12;
    @org.jetbrains.annotations.NotNull()
    public static final com.pinbridge.otpmirror.CryptoUtil INSTANCE = null;
    
    private CryptoUtil() {
        super();
    }
    
    @org.jetbrains.annotations.NotNull()
    public final com.pinbridge.otpmirror.CryptoUtil.EncryptedData encrypt(@org.jetbrains.annotations.NotNull()
    java.lang.String plaintext, @org.jetbrains.annotations.NotNull()
    byte[] secretKey) {
        return null;
    }
    
    @org.jetbrains.annotations.NotNull()
    public final java.lang.String decrypt(@org.jetbrains.annotations.NotNull()
    com.pinbridge.otpmirror.CryptoUtil.EncryptedData encrypted, @org.jetbrains.annotations.NotNull()
    byte[] secretKey) {
        return null;
    }
    
    @kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000\"\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0000\n\u0002\u0010\u000e\n\u0002\b\t\n\u0002\u0010\u000b\n\u0002\b\u0002\n\u0002\u0010\b\n\u0002\b\u0002\b\u0087\b\u0018\u00002\u00020\u0001B\u0015\u0012\u0006\u0010\u0002\u001a\u00020\u0003\u0012\u0006\u0010\u0004\u001a\u00020\u0003\u00a2\u0006\u0002\u0010\u0005J\t\u0010\t\u001a\u00020\u0003H\u00c6\u0003J\t\u0010\n\u001a\u00020\u0003H\u00c6\u0003J\u001d\u0010\u000b\u001a\u00020\u00002\b\b\u0002\u0010\u0002\u001a\u00020\u00032\b\b\u0002\u0010\u0004\u001a\u00020\u0003H\u00c6\u0001J\u0013\u0010\f\u001a\u00020\r2\b\u0010\u000e\u001a\u0004\u0018\u00010\u0001H\u00d6\u0003J\t\u0010\u000f\u001a\u00020\u0010H\u00d6\u0001J\t\u0010\u0011\u001a\u00020\u0003H\u00d6\u0001R\u0011\u0010\u0002\u001a\u00020\u0003\u00a2\u0006\b\n\u0000\u001a\u0004\b\u0006\u0010\u0007R\u0011\u0010\u0004\u001a\u00020\u0003\u00a2\u0006\b\n\u0000\u001a\u0004\b\b\u0010\u0007\u00a8\u0006\u0012"}, d2 = {"Lcom/pinbridge/otpmirror/CryptoUtil$EncryptedData;", "", "cipher", "", "iv", "(Ljava/lang/String;Ljava/lang/String;)V", "getCipher", "()Ljava/lang/String;", "getIv", "component1", "component2", "copy", "equals", "", "other", "hashCode", "", "toString", "app_debug"})
    public static final class EncryptedData {
        @org.jetbrains.annotations.NotNull()
        private final java.lang.String cipher = null;
        @org.jetbrains.annotations.NotNull()
        private final java.lang.String iv = null;
        
        @org.jetbrains.annotations.NotNull()
        public final java.lang.String component1() {
            return null;
        }
        
        @org.jetbrains.annotations.NotNull()
        public final java.lang.String component2() {
            return null;
        }
        
        @org.jetbrains.annotations.NotNull()
        public final com.pinbridge.otpmirror.CryptoUtil.EncryptedData copy(@org.jetbrains.annotations.NotNull()
        java.lang.String cipher, @org.jetbrains.annotations.NotNull()
        java.lang.String iv) {
            return null;
        }
        
        @java.lang.Override()
        public boolean equals(@org.jetbrains.annotations.Nullable()
        java.lang.Object other) {
            return false;
        }
        
        @java.lang.Override()
        public int hashCode() {
            return 0;
        }
        
        @java.lang.Override()
        @org.jetbrains.annotations.NotNull()
        public java.lang.String toString() {
            return null;
        }
        
        public EncryptedData(@org.jetbrains.annotations.NotNull()
        java.lang.String cipher, @org.jetbrains.annotations.NotNull()
        java.lang.String iv) {
            super();
        }
        
        @org.jetbrains.annotations.NotNull()
        public final java.lang.String getCipher() {
            return null;
        }
        
        @org.jetbrains.annotations.NotNull()
        public final java.lang.String getIv() {
            return null;
        }
    }
}