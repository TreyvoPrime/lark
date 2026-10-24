package lark;

/**
 * Compatibility shim for older School installs. New builds use
 * {@link Executable}; {@code school.marker} still maps to that channel.
 */
public final class School {
    static final String CHANNEL = "school";

    private School() {}

    /** True when this JVM is an Executable/School portable install. */
    public static boolean isSchool() {
        return Executable.isExecutable();
    }
}
