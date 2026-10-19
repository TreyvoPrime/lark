package lark;

/** A problem we can explain to the person using Lark. */
final class RequestFail extends RuntimeException {
    final int status;

    RequestFail(int status, String message) {
        super(message);
        this.status = status;
    }
}
