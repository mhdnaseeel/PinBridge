package com.pinbridge.otpmirror;

import com.pinbridge.otpmirror.data.PairingRepository;
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
  private final Provider<PairingRepository> pairingRepositoryProvider;

  public MainActivity_MembersInjector(Provider<PairingRepository> pairingRepositoryProvider) {
    this.pairingRepositoryProvider = pairingRepositoryProvider;
  }

  public static MembersInjector<MainActivity> create(
      Provider<PairingRepository> pairingRepositoryProvider) {
    return new MainActivity_MembersInjector(pairingRepositoryProvider);
  }

  @Override
  public void injectMembers(MainActivity instance) {
    injectPairingRepository(instance, pairingRepositoryProvider.get());
  }

  @InjectedFieldSignature("com.pinbridge.otpmirror.MainActivity.pairingRepository")
  public static void injectPairingRepository(MainActivity instance,
      PairingRepository pairingRepository) {
    instance.pairingRepository = pairingRepository;
  }
}
