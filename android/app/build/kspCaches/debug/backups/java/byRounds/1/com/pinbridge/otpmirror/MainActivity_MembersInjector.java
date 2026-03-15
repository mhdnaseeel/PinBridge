package com.pinbridge.otpmirror;

import android.content.SharedPreferences;
import com.google.firebase.auth.FirebaseAuth;
import dagger.MembersInjector;
import dagger.internal.DaggerGenerated;
import dagger.internal.InjectedFieldSignature;
import dagger.internal.QualifierMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

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
public final class MainActivity_MembersInjector implements MembersInjector<MainActivity> {
  private final Provider<FirebaseAuth> authProvider;

  private final Provider<SharedPreferences> prefsProvider;

  public MainActivity_MembersInjector(Provider<FirebaseAuth> authProvider,
      Provider<SharedPreferences> prefsProvider) {
    this.authProvider = authProvider;
    this.prefsProvider = prefsProvider;
  }

  public static MembersInjector<MainActivity> create(Provider<FirebaseAuth> authProvider,
      Provider<SharedPreferences> prefsProvider) {
    return new MainActivity_MembersInjector(authProvider, prefsProvider);
  }

  @Override
  public void injectMembers(MainActivity instance) {
    injectAuth(instance, authProvider.get());
    injectPrefs(instance, prefsProvider.get());
  }

  @InjectedFieldSignature("com.pinbridge.otpmirror.MainActivity.auth")
  public static void injectAuth(MainActivity instance, FirebaseAuth auth) {
    instance.auth = auth;
  }

  @InjectedFieldSignature("com.pinbridge.otpmirror.MainActivity.prefs")
  public static void injectPrefs(MainActivity instance, SharedPreferences prefs) {
    instance.prefs = prefs;
  }
}
