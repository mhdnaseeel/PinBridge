package com.pinbridge.otpmirror.di;

import android.content.SharedPreferences;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FirebaseFirestore;
import com.pinbridge.otpmirror.data.PairingRepository;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

@ScopeMetadata("javax.inject.Singleton")
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
public final class AppModule_ProvidePairingRepositoryFactory implements Factory<PairingRepository> {
  private final Provider<FirebaseAuth> authProvider;

  private final Provider<FirebaseFirestore> dbProvider;

  private final Provider<SharedPreferences> prefsProvider;

  public AppModule_ProvidePairingRepositoryFactory(Provider<FirebaseAuth> authProvider,
      Provider<FirebaseFirestore> dbProvider, Provider<SharedPreferences> prefsProvider) {
    this.authProvider = authProvider;
    this.dbProvider = dbProvider;
    this.prefsProvider = prefsProvider;
  }

  @Override
  public PairingRepository get() {
    return providePairingRepository(authProvider.get(), dbProvider.get(), prefsProvider.get());
  }

  public static AppModule_ProvidePairingRepositoryFactory create(
      Provider<FirebaseAuth> authProvider, Provider<FirebaseFirestore> dbProvider,
      Provider<SharedPreferences> prefsProvider) {
    return new AppModule_ProvidePairingRepositoryFactory(authProvider, dbProvider, prefsProvider);
  }

  public static PairingRepository providePairingRepository(FirebaseAuth auth, FirebaseFirestore db,
      SharedPreferences prefs) {
    return Preconditions.checkNotNullFromProvides(AppModule.INSTANCE.providePairingRepository(auth, db, prefs));
  }
}
