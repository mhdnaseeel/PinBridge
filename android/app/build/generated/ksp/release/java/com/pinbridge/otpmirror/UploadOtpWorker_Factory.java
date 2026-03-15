package com.pinbridge.otpmirror;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.work.WorkerParameters;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FirebaseFirestore;
import dagger.internal.DaggerGenerated;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

@ScopeMetadata
@QualifierMetadata
@DaggerGenerated
@Generated(
    value = "dagger.internal.codegen.ComponentProcessor",
    comments = "https://dagger.dev"
)
@SuppressWarnings({
    "unchecked",
    "rawtypes",
    "KotlinInternal",
    "KotlinInternalInJava",
    "cast",
    "deprecation"
})
public final class UploadOtpWorker_Factory {
  private final Provider<FirebaseAuth> authProvider;

  private final Provider<FirebaseFirestore> dbProvider;

  private final Provider<SharedPreferences> sharedPrefsProvider;

  public UploadOtpWorker_Factory(Provider<FirebaseAuth> authProvider,
      Provider<FirebaseFirestore> dbProvider, Provider<SharedPreferences> sharedPrefsProvider) {
    this.authProvider = authProvider;
    this.dbProvider = dbProvider;
    this.sharedPrefsProvider = sharedPrefsProvider;
  }

  public UploadOtpWorker get(Context ctx, WorkerParameters params) {
    return newInstance(ctx, params, authProvider.get(), dbProvider.get(), sharedPrefsProvider.get());
  }

  public static UploadOtpWorker_Factory create(Provider<FirebaseAuth> authProvider,
      Provider<FirebaseFirestore> dbProvider, Provider<SharedPreferences> sharedPrefsProvider) {
    return new UploadOtpWorker_Factory(authProvider, dbProvider, sharedPrefsProvider);
  }

  public static UploadOtpWorker newInstance(Context ctx, WorkerParameters params, FirebaseAuth auth,
      FirebaseFirestore db, SharedPreferences sharedPrefs) {
    return new UploadOtpWorker(ctx, params, auth, db, sharedPrefs);
  }
}
